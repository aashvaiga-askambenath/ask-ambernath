const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { businessSchema, canAccessOrder, canTransition, createApp, mapBusiness, mapOrder, orderSchema, requireRole, validateEnvironment } = require('./app');
const { activeCategoryById } = require('./services/marketplace');

test('public business shape never reports ineligible businesses as online', () => {
  const business = mapBusiness({
    id: 'id',
    name: 'Local Water',
    is_active: true,
    verification_status: 'verified',
    online: false,
    categories: { name: 'Water', slug: 'water' },
    business_services: [
      { id: 'available', name: 'Can', price: '40', is_available: true },
      { id: 'hidden', name: 'Hidden', price: '12', is_available: false },
    ],
  });
  assert.equal(business.online, false);
  assert.equal(business.priceFrom, 40);
  assert.deepEqual(business.services.map((service) => service.id), ['available']);
});

test('business eligibility requires verified, active and explicitly online', () => {
  for (const fields of [
    { is_active: false, verification_status: 'verified', online: true },
    { is_active: true, verification_status: 'pending', online: true },
    { is_active: true, verification_status: 'verified', online: false },
  ]) {
    assert.equal(mapBusiness(fields).online, false);
  }
  assert.equal(mapBusiness({ is_active: true, verification_status: 'verified', online: true }).online, true);
});

test('business onboarding schema validates required fields and bounds', () => {
  const valid = {
    name: 'Ambernath Electric',
    categoryId: '1fd49958-bfa1-4b76-bda4-6ad3a8e29192',
    phone: '9876543210',
    addressLine: 'Station Road',
    area: 'Ambernath East',
    pincode: '421501',
    services: [{ name: 'Visit', price: 150 }],
  };
  assert.equal(businessSchema.parse(valid).services[0].price, 150);
  assert.throws(() => businessSchema.parse({ ...valid, pincode: '42150' }));
  assert.throws(() => businessSchema.parse({ ...valid, services: [{ name: 'Visit', price: -1 }] }));
});

test('business onboarding looks up the selected active category by its UUID', async () => {
  const expectedId = '1fd49958-bfa1-4b76-bda4-6ad3a8e29192';
  const filters = [];
  const query = {
    select: (columns) => { assert.equal(columns, 'id'); return query; },
    eq: (column, value) => { filters.push([column, value]); return query; },
    maybeSingle: async () => ({ data: { id: expectedId }, error: null }),
  };
  const client = { from: (table) => { assert.equal(table, 'categories'); return query; } };

  assert.deepEqual(await activeCategoryById(client, expectedId), { id: expectedId });
  assert.deepEqual(filters, [['id', expectedId], ['is_active', true]]);
});

test('order request accepts only safe line items and strips client totals', () => {
  const input = {
    businessId: '1fd49958-bfa1-4b76-bda4-6ad3a8e29192',
    items: [{ serviceId: '20c14d44-ea2f-4d87-a046-535ab6ff16c8', quantity: 2 }],
    deliveryAddress: { address_line_1: 'Station Road', area: 'Ambernath East' },
    paymentMethod: 'cash_on_service',
    idempotencyKey: 'e6177141-86a9-493c-9cb6-0887cc3cfa37',
    subtotal: 0,
    total: 0,
  };
  const parsed = orderSchema.parse(input);
  assert.equal(parsed.items[0].quantity, 2);
  assert.equal('total' in parsed, false);
  assert.throws(() => orderSchema.parse({ ...input, items: [{ ...input.items[0], quantity: 100 }] }));
  assert.throws(() => orderSchema.parse({ ...input, paymentMethod: 'paid_online' }));
  assert.throws(() => orderSchema.parse({ ...input, deliveryAddress: {} }));
});

test('order transitions enforce customer cancellation and owner workflow', () => {
  assert.equal(canTransition('customer', 'Pending', 'Cancelled'), true);
  assert.equal(canTransition('customer', 'Accepted', 'Cancelled'), false);
  assert.equal(canTransition('customer', 'Pending', 'Accepted'), false);
  assert.equal(canTransition('business_owner', 'Pending', 'Accepted'), true);
  assert.equal(canTransition('business_owner', 'Pending', 'Cancelled'), false);
  assert.equal(canTransition('business_owner', 'Completed', 'Preparing'), false);
  assert.equal(canTransition('admin', 'Completed', 'Pending'), false);
});

test('role guard rejects a customer from admin routes', () => {
  let receivedError;
  requireRole('admin', 'super_admin')({ user: { id: 'customer-id', role: 'customer' } }, {}, (error) => { receivedError = error; });
  assert.equal(receivedError.status, 403);
  assert.equal(receivedError.code, 'FORBIDDEN');
});

test('order access checks customer and business ownership before a status mutation', () => {
  const order = { customer_id: 'customer-id', businesses: { owner_id: 'owner-id' } };
  assert.equal(canAccessOrder('customer', 'customer-id', order), true);
  assert.equal(canAccessOrder('customer', 'other-customer', order), false);
  assert.equal(canAccessOrder('business_owner', 'owner-id', order), true);
  assert.equal(canAccessOrder('business_owner', 'other-owner', order), false);
  assert.equal(canAccessOrder('admin', 'admin-id', order), true);
});

test('order database rows are mapped without trusting client-shaped totals', () => {
  const order = mapOrder({
    order_number: 'AMB-123',
    status: 'Pending',
    subtotal: '100.00',
    delivery_fee: '0',
    platform_fee: '0',
    discount: '0',
    total: '100',
    order_items: [{ id: 'line', item_name: 'Water can', unit_price: '50', quantity: 2, line_total: '100' }],
  });
  assert.equal(order.total, 100);
  assert.equal(order.items[0].unitPrice, 50);
});

test('order transaction derives subtotal from current database service prices', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202610090001_initial_marketplace.sql'), 'utf8');
  assert.match(migration, /subtotal_amount := subtotal_amount \+ service_row\.price \* item_record\.quantity/);
  assert.match(migration, /insert into public\.order_items[\s\S]+?service_row\.price, item_record\.quantity, service_row\.price \* item_record\.quantity/);
  assert.doesNotMatch(migration.match(/create or replace function public\.create_order\([\s\S]*?\)\s*returns setof public\.orders/)[0], /p_(?:subtotal|total|unit_price)/i);
});

test('production startup refuses missing privileged Supabase configuration', () => {
  const previous = Object.fromEntries(['NODE_ENV', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_URL', 'CLIENT_ORIGIN'].map((key) => [key, process.env[key]]));
  try {
    process.env.NODE_ENV = 'production';
    for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_URL', 'CLIENT_ORIGIN']) delete process.env[key];
    assert.throws(() => validateEnvironment(), /Missing required production environment variables/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('sitemap reports a configuration error instead of crashing without Supabase', async () => {
  const app = createApp({
    environment: 'test',
    appUrl: 'https://ask-ambernath.example',
    clientOrigins: [],
    databaseConfigured: false,
  });
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/sitemap.xml`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: { code: 'DATABASE_NOT_CONFIGURED', message: 'Marketplace services are not configured yet' },
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
