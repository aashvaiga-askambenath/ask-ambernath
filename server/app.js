const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const { z } = require('zod');
const { HttpError, asyncRoute } = require('./lib/errors');
const { adminRoles, transitions, canTransition, canAccessOrder, mapService, mapBusiness, mapOrder, slugify, escapeFilter, escapeXml } = require('./lib/domain');
const { authenticate, optionalAuthenticate, requireRole, validateUuidParam } = require('./middleware/auth');
const { ownedBusiness, notify, audit } = require('./services/marketplace');
const { businessSchema, serviceSchema, addressSchema, orderSchema, reviewSchema, supportSchema, categorySchema } = require('./validators/schemas');

function validateEnvironment() {
  const production = process.env.NODE_ENV === 'production';
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'APP_URL', 'CLIENT_ORIGIN'];
  const missing = required.filter((name) => !process.env[name]);
  if (production && missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }
  if (process.env.SUPABASE_URL && !/^https:\/\/.+/.test(process.env.SUPABASE_URL) && production) {
    throw new Error('SUPABASE_URL must use HTTPS in production');
  }
  if (production) {
    try {
      const appUrl = new URL(process.env.APP_URL);
      const supabaseUrl = new URL(process.env.SUPABASE_URL);
      const browserSupabaseUrl = new URL(process.env.VITE_SUPABASE_URL);
      const clientOrigins = process.env.CLIENT_ORIGIN.split(',').map((item) => new URL(item.trim()));
      if (appUrl.protocol !== 'https:' || clientOrigins.some((origin) => origin.protocol !== 'https:')) {
        throw new Error('Public application origins must use HTTPS');
      }
      if (supabaseUrl.origin !== browserSupabaseUrl.origin) {
        throw new Error('VITE_SUPABASE_URL must point to the same project as SUPABASE_URL');
      }
      if (!clientOrigins.some((origin) => origin.origin === appUrl.origin)) {
        throw new Error('CLIENT_ORIGIN must include the APP_URL origin');
      }
    } catch {
      throw new Error('SUPABASE_URL, VITE_SUPABASE_URL, APP_URL, and CLIENT_ORIGIN must be valid, matching HTTPS URLs in production');
    }
  }
  return {
    environment: process.env.NODE_ENV || 'development',
    appUrl: process.env.APP_URL || 'http://localhost:5173',
    clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((item) => {
      try { return new URL(item.trim()).origin; } catch { return item.trim(); }
    }).filter(Boolean),
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    databaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

function createApp(config = validateEnvironment()) {
  const app = express();
  const supabase = config.databaseConfigured
    ? createClient(config.supabaseUrl, config.supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

  app.disable('x-powered-by');
  app.set('trust proxy', config.environment === 'production' ? 1 : false);
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: config.environment === 'production' ? {
      directives: {
        connectSrc: ["'self'", ...(config.supabaseUrl ? [new URL(config.supabaseUrl).origin] : []), 'https://www.google-analytics.com', 'https://www.googletagmanager.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.supabase.co'],
        scriptSrc: ["'self'", 'https://www.googletagmanager.com'],
      },
    } : false,
  }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.clientOrigins.includes(origin)) return callback(null, true);
      return callback(new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed'));
    },
    credentials: false,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(compression());
  const rateOptions = {
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' } }),
  };
  app.use('/api', rateLimit({ ...rateOptions, windowMs: 60_000, limit: 180 }));
  app.use('/api/auth', rateLimit({ ...rateOptions, windowMs: 15 * 60_000, limit: 30 }));

  app.get('/api/health', (_req, res) => res.json({
    ok: true,
    service: 'Ask Ambernath API',
    databaseConfigured: config.databaseConfigured,
    time: new Date().toISOString(),
  }));

  app.use('/api', (req, _res, next) => {
    if (!supabase) return next(new HttpError(503, 'DATABASE_NOT_CONFIGURED', 'Marketplace services are not configured yet'));
    req.supabase = supabase;
    next();
  });

  app.get('/api/public-config', (req, res) => res.json({
    supportEmail: process.env.SUPPORT_EMAIL || '',
    supportPhone: process.env.SUPPORT_PHONE || '',
    supportWhatsApp: process.env.SUPPORT_WHATSAPP || '',
    serviceCity: 'Ambernath',
  }));
  app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: req.user }));
  app.patch('/api/profile', authenticate, asyncRoute(async (req, res) => {
    const body = z.object({
      fullName: z.string().trim().min(2).max(100).optional(),
      phone: z.string().trim().regex(/^\+?[0-9 ()-]{8,18}$/).or(z.literal('')).optional(),
    }).refine((value) => Object.keys(value).length > 0, { message: 'At least one profile field is required' }).parse(req.body);
    const patch = {};
    if (body.fullName !== undefined) patch.full_name = body.fullName;
    if (body.phone !== undefined) patch.phone = body.phone || null;
    const { data, error } = await req.supabase.from('profiles').update(patch).eq('id', req.user.id).select('id,full_name,phone,role').single();
    if (error) throw error;
    res.json({ user: { id: data.id, name: data.full_name, phone: data.phone, role: data.role, email: req.user.email } });
  }));
  app.get('/api/categories', asyncRoute(async (req, res) => {
    const { data, error } = await req.supabase.from('categories').select('id,name,slug,icon_key,description,sort_order').eq('is_active', true).order('sort_order');
    if (error) throw error;
    res.json({ categories: data });
  }));

  app.get('/api/businesses', asyncRoute(async (req, res) => {
    const filters = z.object({
      q: z.string().max(120).optional(),
      category: z.string().max(80).optional(),
      area: z.string().max(80).optional(),
      sort: z.enum(['relevance', 'rating', 'price']).default('relevance'),
      offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(50).default(50),
    }).parse(req.query);
    let query = req.supabase.from('businesses')
      .select('*,categories!inner(name,slug,icon_key,is_active),business_services(*)', { count: 'exact' })
      .eq('is_active', true).eq('verification_status', 'verified').eq('online', true).eq('categories.is_active', true);
    if (filters.category) query = query.eq('categories.slug', filters.category);
    if (filters.area) query = query.ilike('area', `%${filters.area}%`);
    const readOffset = filters.q ? 0 : filters.offset;
    const readLimit = filters.q ? 500 : filters.limit;
    const { data, error, count } = await query.order('created_at', { ascending: false }).range(readOffset, readOffset + readLimit - 1);
    if (error) throw error;
    let businesses = (data || []).map(mapBusiness);
    if (filters.q) {
      const terms = filters.q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
      businesses = businesses.map((business) => {
        const searchable = [business.name, business.category, business.tagline, business.description, business.area, ...business.services.map((service) => service.name)].join(' ').toLocaleLowerCase();
        return { business, score: terms.reduce((score, term) => score + (searchable.includes(term) ? 1 : 0), 0) };
      }).filter((entry) => entry.score > 0).map((entry) => ({ ...entry.business, _score: entry.score }));
      if (filters.sort === 'relevance') businesses.sort((a, b) => b._score - a._score);
      if (filters.sort === 'rating') businesses.sort((a, b) => b.averageRating - a.averageRating);
      if (filters.sort === 'price') businesses.sort((a, b) => a.priceFrom - b.priceFrom);
      const total = businesses.length;
      businesses = businesses.slice(filters.offset, filters.offset + filters.limit);
      businesses = businesses.map(({ _score, ...business }) => business);
      res.json({ businesses, total, offset: filters.offset, limit: filters.limit });
      return;
    }
    if (filters.sort === 'rating') businesses.sort((a, b) => b.averageRating - a.averageRating);
    if (filters.sort === 'price') businesses.sort((a, b) => a.priceFrom - b.priceFrom);
    res.json({ businesses, total: count || businesses.length, offset: filters.offset, limit: filters.limit });
  }));

  app.get('/api/businesses/:slug', asyncRoute(async (req, res) => {
    const { data, error } = await req.supabase.from('businesses')
      .select('*,categories!inner(name,slug,icon_key,is_active),business_services(*),business_hours(*),reviews(id,rating,comment,created_at,profiles(full_name))')
      .eq('slug', req.params.slug).eq('is_active', true).eq('verification_status', 'verified').eq('online', true).eq('categories.is_active', true).maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, 'BUSINESS_NOT_FOUND', 'This business is not currently available');
    res.json({ business: mapBusiness(data) });
  }));

  app.post('/api/businesses', authenticate, requireRole('business_owner'), asyncRoute(async (req, res) => {
    const body = businessSchema.parse(req.body);
    const slug = `${slugify(body.name)}-${crypto.randomBytes(3).toString('hex')}`;
    const { data: category, error: categoryError } = await req.supabase.from('categories').select('id').eq('slug', body.categoryId).eq('is_active', true).maybeSingle();
    if (categoryError) throw categoryError;
    if (!category) throw new HttpError(400, 'INVALID_CATEGORY', 'Select an available category');
    const { data: business, error } = await req.supabase.from('businesses').insert({
      owner_id: req.user.id,
      category_id: category.id,
      name: body.name,
      slug,
      tagline: body.tagline,
      description: body.description,
      phone: body.phone,
      whatsapp_phone: body.whatsappPhone || null,
      email: body.email || null,
      address_line: body.addressLine,
      area: body.area,
      city: body.city || 'Ambernath',
      pincode: body.pincode,
      verification_status: 'pending',
      online: false,
    }).select('id').single();
    if (error) throw error;
    if (body.services.length) {
      const services = body.services.map((service, index) => ({
        business_id: business.id,
        name: service.name,
        description: service.description || null,
        price: service.price,
        is_available: true,
        sort_order: index,
      }));
      const result = await req.supabase.from('business_services').insert(services);
      if (result.error) {
        await req.supabase.from('businesses').delete().eq('id', business.id);
        throw result.error;
      }
    }
    await notify(req.supabase, req.user.id, 'business_submitted', 'Business submitted', 'Your business is awaiting verification.', { business_id: business.id });
    const { data: created, error: fetchError } = await req.supabase.from('businesses').select('*,categories(name,slug,icon_key),business_services(*)').eq('id', business.id).single();
    if (fetchError) throw fetchError;
    res.status(201).json({ business: mapBusiness(created) });
  }));

  app.get('/api/owner/businesses', authenticate, requireRole('business_owner'), asyncRoute(async (req, res) => {
    const { data, error } = await req.supabase.from('businesses').select('*,categories(name,slug,icon_key),business_services(*),business_hours(*)').eq('owner_id', req.user.id).order('created_at');
    if (error) throw error;
    res.json({ businesses: (data || []).map((row) => mapBusiness(row, true)) });
  }));

  app.patch('/api/owner/businesses/:id/online', authenticate, requireRole('business_owner'), asyncRoute(async (req, res) => {
    const { online } = z.object({ online: z.boolean() }).parse(req.body);
    const business = await ownedBusiness(req.supabase, req.params.id, req.user.id);
    if (online && (business.verification_status !== 'verified' || !business.is_active)) {
      throw new HttpError(409, 'BUSINESS_NOT_ELIGIBLE', 'Only approved, active businesses can go online');
    }
    const { data, error } = await req.supabase.from('businesses').update({ online }).eq('id', business.id)
      .select('*,categories(name,slug,icon_key),business_services(*),business_hours(*)').single();
    if (error) throw error;
    res.json({ business: mapBusiness(data, true) });
  }));
  app.put('/api/owner/businesses/:id/hours', authenticate, requireRole('business_owner'), asyncRoute(async (req, res) => {
    await ownedBusiness(req.supabase, req.params.id, req.user.id);
    const { hours } = z.object({ hours: z.array(z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      isClosed: z.boolean(),
      openTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
      closeTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    })).length(7) }).parse(req.body);
    const { data, error } = await req.supabase.from('business_hours').upsert(hours.map((hour) => ({
      business_id: req.params.id, day_of_week: hour.dayOfWeek, is_closed: hour.isClosed,
      open_time: hour.isClosed ? null : hour.openTime, close_time: hour.isClosed ? null : hour.closeTime,
    })), { onConflict: 'business_id,day_of_week' }).select();
    if (error) throw error;
    res.json({ hours: data });
  }));

  app.post('/api/owner/businesses/:id/services', authenticate, requireRole('business_owner'), asyncRoute(async (req, res) => {
    await ownedBusiness(req.supabase, req.params.id, req.user.id);
    const body = serviceSchema.parse(req.body);
    const { data, error } = await req.supabase.from('business_services').insert({
      business_id: req.params.id, name: body.name, description: body.description || null, price: body.price,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ service: mapService(data) });
  }));

  app.patch('/api/owner/services/:id', authenticate, requireRole('business_owner'), asyncRoute(async (req, res) => {
    const body = serviceSchema.partial().parse(req.body);
    const { data: current, error: findError } = await req.supabase.from('business_services')
      .select('id,business_id').eq('id', req.params.id).maybeSingle();
    if (findError) throw findError;
    if (!current) throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Service not found');
    await ownedBusiness(req.supabase, current.business_id, req.user.id);
    const changes = {};
    if (body.name !== undefined) changes.name = body.name;
    if (body.description !== undefined) changes.description = body.description;
    if (body.price !== undefined) changes.price = body.price;
    if (body.isAvailable !== undefined) changes.is_available = body.isAvailable;
    const { data, error } = await req.supabase.from('business_services').update(changes).eq('id', current.id).select().single();
    if (error) throw error;
    res.json({ service: mapService(data) });
  }));

  app.get('/api/addresses', authenticate, requireRole('customer'), asyncRoute(async (req, res) => {
    const { data, error } = await req.supabase.from('customer_addresses').select('*').eq('customer_id', req.user.id).order('is_default', { ascending: false });
    if (error) throw error;
    res.json({ addresses: data });
  }));
  app.post('/api/addresses', authenticate, requireRole('customer'), asyncRoute(async (req, res) => {
    const body = addressSchema.parse(req.body);
    const { data, error } = await req.supabase.from('customer_addresses').insert({
      customer_id: req.user.id, ...body, is_default: body.is_default || false,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ address: data });
  }));
  app.delete('/api/addresses/:id', authenticate, requireRole('customer'), validateUuidParam(), asyncRoute(async (req, res) => {
    const { error, count } = await req.supabase.from('customer_addresses').delete({ count: 'exact' }).eq('id', req.params.id).eq('customer_id', req.user.id);
    if (error) throw error;
    if (!count) throw new HttpError(404, 'ADDRESS_NOT_FOUND', 'Address not found');
    res.status(204).end();
  }));

  app.get('/api/favorites', authenticate, requireRole('customer'), asyncRoute(async (req, res) => {
    const { data, error } = await req.supabase.from('favorites')
      .select('business_id,businesses!inner(*,categories!inner(name,slug,icon_key,is_active),business_services(*))')
      .eq('customer_id', req.user.id)
      .eq('businesses.is_active', true)
      .eq('businesses.verification_status', 'verified')
      .eq('businesses.online', true)
      .eq('businesses.categories.is_active', true);
    if (error) throw error;
    res.json({ businesses: (data || []).map((row) => row.businesses).filter(Boolean).map(mapBusiness) });
  }));
  app.post('/api/favorites/:businessId', authenticate, requireRole('customer'), validateUuidParam('businessId'), asyncRoute(async (req, res) => {
    const { error } = await req.supabase.from('favorites').upsert({ customer_id: req.user.id, business_id: req.params.businessId }, { onConflict: 'customer_id,business_id', ignoreDuplicates: true });
    if (error) throw error;
    res.status(204).end();
  }));
  app.delete('/api/favorites/:businessId', authenticate, requireRole('customer'), validateUuidParam('businessId'), asyncRoute(async (req, res) => {
    const { error } = await req.supabase.from('favorites').delete().eq('customer_id', req.user.id).eq('business_id', req.params.businessId);
    if (error) throw error;
    res.status(204).end();
  }));

  app.get('/api/orders/my', authenticate, requireRole('customer'), asyncRoute(async (req, res) => {
    const { data, error } = await req.supabase.from('orders').select('*,order_items(*),order_events(*),reviews(id)').eq('customer_id', req.user.id).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ orders: (data || []).map(mapOrder) });
  }));
  app.get('/api/orders/business', authenticate, requireRole('business_owner'), asyncRoute(async (req, res) => {
    let query = req.supabase.from('orders').select('*,order_items(*),order_events(*),reviews(id),businesses!inner(owner_id,name)')
      .eq('businesses.owner_id', req.user.id).order('created_at', { ascending: false });
    if (req.query.businessId) query = query.eq('business_id', req.query.businessId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ orders: (data || []).map(mapOrder) });
  }));
  app.get('/api/orders/admin', authenticate, requireRole(...adminRoles), asyncRoute(async (req, res) => {
    const { data, error } = await req.supabase.from('orders').select('*,order_items(*),order_events(*),reviews(id),businesses(name)').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    res.json({ orders: (data || []).map(mapOrder) });
  }));
  app.post('/api/orders', authenticate, requireRole('customer'), asyncRoute(async (req, res) => {
    const body = orderSchema.parse(req.body);
    const { data: profile, error: profileError } = await req.supabase.from('profiles').select('full_name,phone').eq('id', req.user.id).single();
    if (profileError) throw profileError;
    const userClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: req.headers.authorization } },
    });
    const { data, error } = await userClient.rpc('create_order', {
      p_customer_id: req.user.id,
      p_business_id: body.businessId,
      p_items: body.items,
      p_customer_name: body.customerName || profile.full_name,
      p_customer_phone: body.customerPhone || profile.phone,
      p_delivery_address: body.deliveryAddress,
      p_notes: body.notes || '',
      p_payment_method: body.paymentMethod,
      p_idempotency_key: body.idempotencyKey,
    });
    if (error) throw error;
    res.status(201).json({ order: mapOrder(data) });
  }));
  app.get('/api/orders/:id', authenticate, validateUuidParam(), asyncRoute(async (req, res) => {
    let query = req.supabase.from('orders').select('*,order_items(*),order_events(*),reviews(id),businesses(name,owner_id)');
    if (req.user.role === 'customer') query = query.eq('customer_id', req.user.id);
    else if (req.user.role === 'business_owner') query = query.eq('businesses.owner_id', req.user.id);
    else if (!adminRoles.includes(req.user.role)) throw new HttpError(403, 'FORBIDDEN', 'Access denied');
    const { data, error } = await query.eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found');
    res.json({ order: mapOrder(data) });
  }));
  app.patch('/api/orders/:id/status', authenticate, validateUuidParam(), asyncRoute(async (req, res) => {
    const { status, note } = z.object({ status: z.enum(Object.keys(transitions)), note: z.string().max(500).optional() }).parse(req.body);
    if (!adminRoles.includes(req.user.role) && req.user.role !== 'customer' && req.user.role !== 'business_owner') {
      throw new HttpError(403, 'FORBIDDEN', 'Access denied');
    }
    const { data: currentOrder, error: currentOrderError } = await req.supabase.from('orders')
      .select('id,status,customer_id,businesses!inner(owner_id)').eq('id', req.params.id).maybeSingle();
    if (currentOrderError) throw currentOrderError;
    if (!currentOrder) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found');
    if (!canAccessOrder(req.user.role, req.user.id, currentOrder)) throw new HttpError(403, 'FORBIDDEN', 'You cannot update this order');
    if (!canTransition(req.user.role, currentOrder.status, status)) {
      throw new HttpError(400, 'INVALID_ORDER_TRANSITION', `The order cannot move from ${currentOrder.status} to ${status}`);
    }
    const userClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: req.headers.authorization } },
    });
    const { data, error } = await userClient.rpc('transition_order', {
      p_order_id: req.params.id,
      p_actor_id: req.user.id,
      p_new_status: status,
      p_note: note || null,
    });
    if (error) throw error;
    res.json({ order: mapOrder(data) });
  }));

  app.post('/api/reviews', authenticate, requireRole('customer'), asyncRoute(async (req, res) => {
    const body = reviewSchema.parse(req.body);
    const { data: order, error: orderError } = await req.supabase.from('orders')
      .select('id,customer_id,business_id,status,businesses(owner_id)')
      .eq('id', body.orderId).eq('customer_id', req.user.id).maybeSingle();
    if (orderError) throw orderError;
    if (!order || order.business_id !== body.businessId || order.status !== 'Completed') {
      throw new HttpError(403, 'REVIEW_NOT_ELIGIBLE', 'A review can only be added to your completed order');
    }
    if (order.businesses?.owner_id === req.user.id) throw new HttpError(403, 'REVIEW_NOT_ELIGIBLE', 'You cannot review your own business');
    const { data, error } = await req.supabase.from('reviews').insert({
      order_id: body.orderId, customer_id: req.user.id, business_id: body.businessId, rating: body.rating, comment: body.comment || '',
    }).select().single();
    if (error) throw error;
    res.status(201).json({ review: data });
  }));
  app.get('/api/notifications', authenticate, asyncRoute(async (req, res) => {
    const { data, error } = await req.supabase.from('notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    res.json({ notifications: data });
  }));
  app.patch('/api/notifications/:id/read', authenticate, asyncRoute(async (req, res) => {
    const { data, error } = await req.supabase.from('notifications').update({ read_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('user_id', req.user.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found');
    res.status(204).end();
  }));
  app.post('/api/support', optionalAuthenticate, asyncRoute(async (req, res) => {
    const body = supportSchema.parse(req.body);
    const { error } = await req.supabase.from('support_requests').insert({
      user_id: req.user?.id || null, name: body.name, phone: body.phone, email: body.email || null,
      subject: body.subject, message: body.message,
    });
    if (error) throw error;
    res.status(201).json({ message: 'Support request submitted' });
  }));

  app.get('/api/admin/metrics', authenticate, requireRole(...adminRoles), asyncRoute(async (req, res) => {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const counts = await Promise.all([
      req.supabase.from('profiles').select('*', { count: 'exact', head: true }),
      req.supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
      req.supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'business_owner'),
      req.supabase.from('businesses').select('*', { count: 'exact', head: true }),
      req.supabase.from('businesses').select('*', { count: 'exact', head: true }).eq('verification_status', 'pending'),
      req.supabase.from('businesses').select('*', { count: 'exact', head: true }).eq('verification_status', 'verified'),
      req.supabase.from('businesses').select('*', { count: 'exact', head: true }).eq('verification_status', 'verified').eq('is_active', true).eq('online', true),
      req.supabase.from('orders').select('*', { count: 'exact', head: true }),
      req.supabase.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', startOfToday.toISOString()),
      req.supabase.from('orders').select('total').eq('status', 'Completed'),
      req.supabase.from('support_requests').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    ]);
    const failed = counts.find((result) => result.error);
    if (failed) throw failed.error;
    const completedRevenue = (counts[9].data || []).reduce((total, order) => total + Number(order.total), 0);
    res.json({
      metrics: {
        users: counts[0].count || 0, customers: counts[1].count || 0, owners: counts[2].count || 0,
        businesses: counts[3].count || 0, pendingVerifications: counts[4].count || 0,
        verifiedBusinesses: counts[5].count || 0, onlineBusinesses: counts[6].count || 0,
        totalOrders: counts[7].count || 0, ordersToday: counts[8].count || 0,
        completedRevenue, openSupport: counts[10].count || 0,
      },
    });
  }));
  app.get('/api/admin/businesses', authenticate, requireRole(...adminRoles), asyncRoute(async (req, res) => {
    let query = req.supabase.from('businesses').select('*,categories(name,slug),profiles!businesses_owner_id_fkey(full_name),business_documents(id,document_type,verification_status)').order('created_at', { ascending: false });
    if (req.query.status) query = query.eq('verification_status', req.query.status);
    if (req.query.q) query = query.or(`name.ilike.%${escapeFilter(req.query.q)}%,area.ilike.%${escapeFilter(req.query.q)}%`);
    const { data, error } = await query.limit(200);
    if (error) throw error;
    res.json({ businesses: (data || []).map((row) => ({ ...mapBusiness(row, true), ownerId: row.owner_id, ownerName: row.profiles?.full_name || '', documents: row.business_documents || [] })) });
  }));
  app.patch('/api/admin/businesses/:id/verification', authenticate, requireRole(...adminRoles), validateUuidParam(), asyncRoute(async (req, res) => {
    const body = z.object({ verificationStatus: z.enum(['verified', 'rejected', 'suspended', 'pending']), approvalNotes: z.string().max(1000).optional() }).parse(req.body);
    const { data, error } = await req.supabase.from('businesses').update({
      verification_status: body.verificationStatus,
      approval_notes: body.approvalNotes || null,
      online: body.verificationStatus === 'verified' ? undefined : false,
    }).eq('id', req.params.id).select('id,owner_id,name,verification_status,online').maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, 'BUSINESS_NOT_FOUND', 'Business not found');
    await audit(req.supabase, req.user.id, `business_${body.verificationStatus}`, 'business', data.id, { note: body.approvalNotes });
    await notify(req.supabase, data.owner_id, 'business_status', 'Business status updated', `Your business "${data.name}" is ${data.verification_status}.`, { business_id: data.id });
    res.json({ business: data });
  }));
  app.patch('/api/admin/businesses/:id/online', authenticate, requireRole(...adminRoles), validateUuidParam(), asyncRoute(async (req, res) => {
    const { online } = z.object({ online: z.boolean() }).parse(req.body);
    const { data, error } = await req.supabase.from('businesses').update({ online })
      .eq('id', req.params.id).eq('verification_status', 'verified').eq('is_active', true)
      .select('id,online,verification_status').maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(409, 'BUSINESS_NOT_ELIGIBLE', 'Only approved, active businesses can be put online');
    await audit(req.supabase, req.user.id, online ? 'business_online' : 'business_offline', 'business', req.params.id, {});
    res.json({ business: data });
  }));
  app.get('/api/admin/users', authenticate, requireRole(...adminRoles), asyncRoute(async (req, res) => {
    let query = req.supabase.from('profiles').select('id,full_name,phone,role,is_active,created_at').order('created_at', { ascending: false });
    if (req.query.q) query = query.or(`full_name.ilike.%${escapeFilter(req.query.q)}%,phone.ilike.%${escapeFilter(req.query.q)}%`);
    const { data, error } = await query.limit(200);
    if (error) throw error;
    res.json({ users: data });
  }));
  app.patch('/api/admin/users/:id/active', authenticate, requireRole(...adminRoles), validateUuidParam(), asyncRoute(async (req, res) => {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    if (req.params.id === req.user.id && !isActive) throw new HttpError(409, 'SELF_DEACTIVATION_BLOCKED', 'You cannot deactivate your own administrator account here');
    const { data, error } = await req.supabase.from('profiles').select('id,role').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');
    if (data.role === 'super_admin' && !isActive) throw new HttpError(409, 'SUPER_ADMIN_PROTECTED', 'A super admin cannot be deactivated here');
    const result = await req.supabase.from('profiles').update({ is_active: isActive }).eq('id', data.id).select('id,role,is_active').single();
    if (result.error) throw result.error;
    await audit(req.supabase, req.user.id, isActive ? 'user_activated' : 'user_deactivated', 'profile', data.id, {});
    res.json({ user: result.data });
  }));
  app.get('/api/admin/categories', authenticate, requireRole(...adminRoles), asyncRoute(async (req, res) => {
    const { data, error } = await req.supabase.from('categories').select('*').order('sort_order');
    if (error) throw error;
    res.json({ categories: data });
  }));
  app.post('/api/admin/categories', authenticate, requireRole(...adminRoles), asyncRoute(async (req, res) => {
    const body = categorySchema.parse(req.body);
    const { data, error } = await req.supabase.from('categories').insert({
      name: body.name, slug: slugify(body.name), icon_key: body.iconKey, description: body.description, sort_order: body.sortOrder,
    }).select().single();
    if (error) throw error;
    await audit(req.supabase, req.user.id, 'category_created', 'category', data.id, {});
    res.status(201).json({ category: data });
  }));
  app.patch('/api/admin/categories/:id', authenticate, requireRole(...adminRoles), validateUuidParam(), asyncRoute(async (req, res) => {
    const body = categorySchema.partial().parse(req.body);
    const patch = {};
    if (body.name !== undefined) { patch.name = body.name; patch.slug = slugify(body.name); }
    if (body.iconKey !== undefined) patch.icon_key = body.iconKey;
    if (body.description !== undefined) patch.description = body.description;
    if (body.sortOrder !== undefined) patch.sort_order = body.sortOrder;
    if (body.isActive !== undefined) patch.is_active = body.isActive;
    const { data, error } = await req.supabase.from('categories').update(patch).eq('id', req.params.id).select().maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
    await audit(req.supabase, req.user.id, 'category_updated', 'category', data.id, {});
    res.json({ category: data });
  }));
  app.get('/api/admin/settings', authenticate, requireRole(...adminRoles), asyncRoute(async (req, res) => {
    const { data, error } = await req.supabase.from('app_settings')
      .select('key,value').in('key', ['platform_fee', 'delivery_fee', 'service_city']);
    if (error) throw error;
    res.json({ settings: Object.fromEntries((data || []).map((setting) => [setting.key, setting.value])) });
  }));
  app.patch('/api/admin/settings/:key', authenticate, requireRole(...adminRoles), asyncRoute(async (req, res) => {
    const key = z.enum(['platform_fee', 'delivery_fee']).parse(req.params.key);
    const { value } = z.object({ value: z.number().min(0).max(100000) }).parse(req.body);
    const { data, error } = await req.supabase.from('app_settings')
      .upsert({ key, value }, { onConflict: 'key' }).select('key,value').single();
    if (error) throw error;
    await audit(req.supabase, req.user.id, 'platform_setting_updated', 'app_setting', null, { key, value });
    res.json({ setting: data });
  }));
  app.get('/api/admin/activity', authenticate, requireRole(...adminRoles), asyncRoute(async (req, res) => {
    const { data, error } = await req.supabase.from('admin_activity').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    res.json({ activity: data });
  }));
  app.get('/api/admin/support', authenticate, requireRole(...adminRoles), asyncRoute(async (req, res) => {
    const { data, error } = await req.supabase.from('support_requests').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    res.json({ requests: data });
  }));
  app.get('/api/admin/reviews', authenticate, requireRole(...adminRoles), asyncRoute(async (req, res) => {
    const { data, error } = await req.supabase.from('reviews').select('*,profiles(full_name),businesses(name)').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    res.json({ reviews: data });
  }));
  app.patch('/api/admin/support/:id', authenticate, requireRole(...adminRoles), validateUuidParam(), asyncRoute(async (req, res) => {
    const { status } = z.object({ status: z.enum(['open', 'in_progress', 'resolved']) }).parse(req.body);
    const { data, error } = await req.supabase.from('support_requests').update({ status }).eq('id', req.params.id).select().maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, 'SUPPORT_NOT_FOUND', 'Support request not found');
    await audit(req.supabase, req.user.id, `support_${status}`, 'support_request', data.id, {});
    res.json({ request: data });
  }));
  app.patch('/api/admin/reviews/:id', authenticate, requireRole(...adminRoles), validateUuidParam(), asyncRoute(async (req, res) => {
    const { isVisible } = z.object({ isVisible: z.boolean() }).parse(req.body);
    const { data, error } = await req.supabase.from('reviews').update({ is_visible: isVisible }).eq('id', req.params.id).select().maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, 'REVIEW_NOT_FOUND', 'Review not found');
    await audit(req.supabase, req.user.id, isVisible ? 'review_restored' : 'review_hidden', 'review', data.id, {});
    res.json({ review: data });
  }));
  app.get('/api/admin/documents/:id/signed-url', authenticate, requireRole(...adminRoles), validateUuidParam(), asyncRoute(async (req, res) => {
    const { data: document, error: findError } = await req.supabase.from('business_documents')
      .select('file_url').eq('id', req.params.id).maybeSingle();
    if (findError) throw findError;
    if (!document) throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Verification document not found');
    const { data, error } = await req.supabase.storage.from('verification-documents').createSignedUrl(document.file_url, 60);
    if (error) throw error;
    res.json({ signedUrl: data.signedUrl, expiresIn: 60 });
  }));

  app.post('/api/owner/businesses/:id/upload', authenticate, requireRole('business_owner'), asyncRoute(async (req, res) => {
    const body = z.object({
      fileName: z.string().max(120),
      contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
      size: z.number().int().positive().max(10 * 1024 * 1024),
      documentType: z.enum(['logo', 'cover', 'service', 'verification']).default('logo'),
    }).parse(req.body);
    await ownedBusiness(req.supabase, req.params.id, req.user.id);
    if (body.documentType === 'verification' && body.contentType !== 'application/pdf') {
      throw new HttpError(400, 'INVALID_FILE_TYPE', 'Verification documents must be PDF files');
    }
    const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' })[body.contentType];
    const bucket = body.documentType === 'verification' ? 'verification-documents' : 'business-media';
    const filePath = `${req.params.id}/${crypto.randomUUID()}.${extension}`;
    const { data, error } = await req.supabase.storage.from(bucket).createSignedUploadUrl(filePath);
    if (error) throw error;
    let publicUrl = null;
    if (bucket === 'business-media') {
      publicUrl = req.supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
      const column = body.documentType === 'cover' ? 'cover_image_url' : body.documentType === 'logo' ? 'logo_url' : null;
      if (column) {
        const update = await req.supabase.from('businesses').update({ [column]: publicUrl }).eq('id', req.params.id);
        if (update.error) throw update.error;
      }
    }
    if (body.documentType === 'verification') {
      const insertResult = await req.supabase.from('business_documents').insert({
        business_id: req.params.id, document_type: 'verification', file_url: filePath, verification_status: 'pending',
      });
      if (insertResult.error) throw insertResult.error;
    }
    res.status(201).json({ bucket, path: filePath, token: data.token, signedUrl: data.signedUrl, contentType: body.contentType, publicUrl });
  }));

  app.get('/sitemap.xml', asyncRoute(async (req, res) => {
    const { data, error } = await req.supabase.from('businesses').select('slug,categories!inner(is_active)').eq('is_active', true).eq('verification_status', 'verified').eq('online', true).eq('categories.is_active', true).limit(500);
    if (error) throw error;
    const urls = ['/', '/explore', '/ask', '/terms', '/privacy', '/cancellation', ...(data || []).map((item) => `/business/${item.slug}`)];
    const xml = urls.map((url) => `<url><loc>${escapeXml(new URL(url, config.appUrl).toString())}</loc></url>`).join('');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${xml}</urlset>`);
  }));
  app.get('/robots.txt', (_req, res) => res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /account',
    'Disallow: /orders',
    'Disallow: /admin',
    'Disallow: /business',
    'Disallow: /checkout',
    'Disallow: /auth',
    `Sitemap: ${new URL('/sitemap.xml', config.appUrl).toString()}`,
  ].join('\n')));

  const distPath = path.join(__dirname, '..', 'client', 'dist');
  if (config.environment === 'production') {
    app.use(express.static(distPath, {
      maxAge: '1h',
      index: false,
      setHeaders(res, filePath) {
        if (path.basename(filePath) === 'index.html') res.setHeader('Cache-Control', 'no-cache');
        else if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }));
    app.get('/{*splat}', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
  app.use((req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Route not found')));
  app.use((error, req, res, _next) => {
    const malformedJson = error instanceof SyntaxError && error.status === 400 && 'body' in error;
    const status = error instanceof HttpError ? error.status : error.name === 'ZodError' || malformedJson ? 400 : 500;
    const code = error instanceof HttpError ? error.code : error.name === 'ZodError' ? 'VALIDATION_ERROR' : malformedJson ? 'INVALID_JSON' : 'INTERNAL_ERROR';
    const fields = error.name === 'ZodError'
      ? Object.fromEntries(error.issues.map((issue) => [issue.path.join('.'), issue.message]))
      : undefined;
    if (status >= 500) console.error(JSON.stringify({ level: 'error', method: req.method, path: req.path, code, errorType: error.name || 'Error' }));
    const safeMessage = error instanceof HttpError ? error.message : status >= 500 ? 'The request could not be completed. Please try again.' : error.message;
    res.status(status).json({ error: { code, message: safeMessage, ...(fields ? { fields } : {}) } });
  });
  return app;
}

module.exports = {
  createApp, validateEnvironment, transitions, canTransition, canAccessOrder,
  mapBusiness, mapOrder, businessSchema, orderSchema, HttpError, requireRole,
};
