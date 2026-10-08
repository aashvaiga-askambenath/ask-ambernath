const adminRoles = ['admin', 'super_admin'];
const transitions = {
  Pending: ['Accepted', 'Rejected', 'Cancelled'],
  Accepted: ['Preparing', 'Scheduled', 'In Progress', 'Cancelled'],
  Preparing: ['Out for Delivery', 'Completed', 'Cancelled'],
  Scheduled: ['In Progress', 'Cancelled'],
  'In Progress': ['Completed', 'Cancelled'],
  'Out for Delivery': ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
  Rejected: [],
};

function canTransition(role, current, next) {
  if (role === 'customer') return current === 'Pending' && next === 'Cancelled';
  if (role === 'business_owner' && current === 'Pending') return ['Accepted', 'Rejected'].includes(next);
  if (['business_owner', ...adminRoles].includes(role)) return (transitions[current] || []).includes(next);
  return false;
}

function canAccessOrder(role, userId, order) {
  if (adminRoles.includes(role)) return true;
  if (role === 'customer') return order.customer_id === userId;
  if (role === 'business_owner') return order.businesses?.owner_id === userId;
  return false;
}

function mapService(row) {
  return {
    id: row.id, name: row.name, description: row.description, price: Number(row.price),
    comparePrice: row.compare_price, unitLabel: row.unit_label, estimatedTime: row.estimated_time,
    imageUrl: row.image_url, isAvailable: row.is_available,
  };
}

function mapBusiness(row, includeUnavailable = false) {
  const services = (row.business_services || [])
    .filter((item) => includeUnavailable || item.is_available !== false)
    .map(mapService);
  const eligibleOnline = row.is_active === true && row.verification_status === 'verified' && row.online === true;
  return {
    id: row.id, slug: row.slug, name: row.name, phone: row.phone, whatsappPhone: row.whatsapp_phone,
    email: row.email, category: row.categories?.name || '', categoryId: row.categories?.slug || '',
    area: row.area, address: row.address_line, city: row.city, pincode: row.pincode, tagline: row.tagline,
    description: row.description, logoUrl: row.logo_url, coverImageUrl: row.cover_image_url,
    priceFrom: services.length ? Math.min(...services.map((service) => service.price)) : 0,
    services, hours: row.business_hours || [],
    reviews: (row.reviews || []).filter((review) => review.is_visible !== false),
    averageRating: Number(row.average_rating || 0), ratingCount: Number(row.rating_count || 0),
    verificationStatus: row.verification_status, online: eligibleOnline, isActive: row.is_active,
  };
}

function mapOrder(row) {
  return {
    id: row.id, orderNumber: row.order_number, customerId: row.customer_id, businessId: row.business_id,
    businessName: row.businesses?.name || row.business_name || '', status: row.status || '',
    subtotal: Number(row.subtotal), deliveryFee: Number(row.delivery_fee), platformFee: Number(row.platform_fee),
    discount: Number(row.discount), total: Number(row.total), paymentMethod: row.payment_method,
    paymentStatus: row.payment_status, customerName: row.customer_name, customerPhone: row.customer_phone,
    deliveryAddress: row.delivery_address, notes: row.notes,
    items: (row.order_items || []).map((item) => ({
      id: item.id, serviceId: item.service_id, itemName: item.item_name, unitPrice: Number(item.unit_price),
      quantity: item.quantity, lineTotal: Number(item.line_total),
    })),
    hasReview: Array.isArray(row.reviews) ? row.reviews.length > 0 : Boolean(row.reviews),
    events: (row.order_events || []).map((event) => ({
      status: event.new_status, note: event.note, createdAt: event.created_at, actorId: event.actor_id,
    })),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function slugify(value) {
  return value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}
function escapeFilter(value) {
  return String(value).replace(/[%_(),]/g, ' ').slice(0, 100);
}
function escapeXml(value) {
  return value.replace(/[<>&'"]/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  })[character]);
}

module.exports = {
  adminRoles, transitions, canTransition, canAccessOrder, mapBusiness, mapOrder,
  slugify, escapeFilter, escapeXml,
};
