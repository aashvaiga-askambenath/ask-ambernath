const { z } = require('zod');

const businessSchema = z.object({
  name: z.string().trim().min(2).max(120),
  categoryId: z.string().uuid(),
  tagline: z.string().trim().max(180).default(''),
  description: z.string().trim().max(3000).default(''),
  phone: z.string().trim().regex(/^[+0-9 ()-]{8,20}$/),
  whatsappPhone: z.string().trim().regex(/^[+0-9 ()-]{8,20}$/).optional().or(z.literal('')),
  email: z.string().email().max(254).optional().or(z.literal('')),
  addressLine: z.string().trim().min(4).max(200),
  area: z.string().trim().min(2).max(80),
  city: z.string().trim().max(80).default('Ambernath'),
  pincode: z.string().regex(/^\d{6}$/),
  services: z.array(z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().max(500).optional(),
    price: z.number().min(0).max(1000000),
  })).max(50).default([]),
});

const serviceSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  price: z.number().min(0).max(1000000).optional(),
  isAvailable: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

const addressSchema = z.object({
  label: z.string().trim().min(1).max(40), recipient_name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{8,18}$/), address_line_1: z.string().trim().min(4).max(200),
  address_line_2: z.string().trim().max(200).optional().nullable(), landmark: z.string().trim().max(120).optional().nullable(),
  area: z.string().trim().min(2).max(80), city: z.string().trim().max(80).default('Ambernath'),
  pincode: z.string().regex(/^\d{6}$/), is_default: z.boolean().optional(),
});

const deliveryAddressSchema = z.object({
  address_line_1: z.string().trim().min(5).max(200),
  address_line_2: z.string().trim().max(200).optional().or(z.literal('')),
  landmark: z.string().trim().max(120).optional().or(z.literal('')),
  area: z.string().trim().min(2).max(80),
  city: z.string().trim().max(80).optional(),
  pincode: z.string().regex(/^\d{6}$/).or(z.literal('')).optional(),
});

const orderSchema = z.object({
  businessId: z.string().uuid(),
  items: z.array(z.object({ serviceId: z.string().uuid(), quantity: z.number().int().min(1).max(99) })).min(1).max(50),
  customerName: z.string().trim().min(2).max(100).optional(),
  customerPhone: z.string().trim().regex(/^\+?[0-9 ()-]{8,18}$/).optional(),
  deliveryAddress: deliveryAddressSchema,
  notes: z.string().max(1000).optional(),
  paymentMethod: z.enum(['cash_on_service', 'upi_on_service']).default('cash_on_service'),
  idempotencyKey: z.string().uuid(),
});

const reviewSchema = z.object({
  orderId: z.string().uuid(), businessId: z.string().uuid(),
  rating: z.number().int().min(1).max(5), comment: z.string().max(2000).optional(),
});
const supportSchema = z.object({
  name: z.string().trim().min(2).max(100), phone: z.string().trim().regex(/^\+?[0-9 ()-]{8,18}$/),
  email: z.string().email().max(254).optional().or(z.literal('')),
  subject: z.string().trim().min(3).max(160), message: z.string().trim().min(10).max(5000),
});
const categorySchema = z.object({
  name: z.string().trim().min(2).max(80), iconKey: z.string().max(40).optional(),
  description: z.string().max(300).optional(), sortOrder: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
});

module.exports = { businessSchema, serviceSchema, addressSchema, deliveryAddressSchema, orderSchema, reviewSchema, supportSchema, categorySchema };
