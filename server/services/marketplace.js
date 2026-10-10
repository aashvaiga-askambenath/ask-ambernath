const { HttpError } = require('../lib/errors');

async function ownedBusiness(client, businessId, ownerId) {
  const { data, error } = await client.from('businesses')
    .select('*').eq('id', businessId).eq('owner_id', ownerId).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'BUSINESS_NOT_FOUND', 'Business not found');
  return data;
}

async function activeCategoryById(client, categoryId) {
  const { data, error } = await client.from('categories')
    .select('id').eq('id', categoryId).eq('is_active', true).maybeSingle();
  if (error) throw error;
  return data;
}

async function getCheckoutFees(client) {
  const { data, error } = await client.from('app_settings')
    .select('key,value').in('key', ['platform_fee', 'delivery_fee']);
  if (error) throw error;

  const settings = Object.fromEntries((data || []).map(({ key, value }) => [key, Number(value)]));
  const fees = {
    platformFee: settings.platform_fee ?? 0,
    deliveryFee: settings.delivery_fee ?? 0,
  };
  if (Object.values(fees).some((amount) => !Number.isFinite(amount) || amount < 0)) {
    throw new Error('Checkout fee settings must be non-negative numbers');
  }
  return fees;
}

async function notify(client, userId, type, title, message, data = {}) {
  const { error } = await client.from('notifications').insert({ user_id: userId, type, title, message, data });
  if (error) throw error;
}

async function audit(client, actorId, action, entityType, entityId, metadata) {
  const { error } = await client.from('admin_activity').insert({
    actor_id: actorId, action, entity_type: entityType, entity_id: entityId, metadata,
  });
  if (error) throw error;
}

module.exports = { ownedBusiness, activeCategoryById, getCheckoutFees, notify, audit };
