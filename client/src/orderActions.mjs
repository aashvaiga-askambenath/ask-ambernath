const ownerOrderActionLabels = {
  Accepted: 'Accept',
  Rejected: 'Reject',
  Preparing: 'Start preparing',
  Scheduled: 'Schedule',
  'In Progress': 'Start service',
  'Out for Delivery': 'Mark out for delivery',
  Completed: 'Complete',
  Cancelled: 'Cancel',
};

export function orderActionLabel(role, status) {
  if (role === 'customer' && status === 'Cancelled') return 'Cancel order';
  return role === 'business_owner' ? ownerOrderActionLabels[status] || status : status;
}
