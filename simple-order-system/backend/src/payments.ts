import fetch from 'node-fetch';

interface PaymentRequest {
  amount: number;
  currency: string;
  orderId: string;
  tableNumber: number;
  description: string;
  customerEmail?: string;
}

interface SumUpCheckout {
  id: string;
  checkout_reference: string;
  amount: number;
  currency: string;
  status: string;
  date: string;
}

interface RaiseNowPayLink {
  paylink_url: string;
  qr_code_url: string;
  reference: string;
}

/**
 * SumUp Payment Integration
 * For card payments and SumUp terminal integration
 */
export class SumUpPayment {
  private apiKey: string;
  private merchantCode: string;
  private baseUrl: string;
  private affiliateKey: string;
  private readerId: string;

  constructor() {
    this.apiKey = process.env.SUMUP_API_KEY || '';
    this.merchantCode = process.env.SUMUP_MERCHANT_CODE || '';
    this.affiliateKey = process.env.SUMUP_AFFILIATE_KEY || '';
    this.readerId = process.env.SUMUP_READER_ID || '';
    this.baseUrl = process.env.SUMUP_BASE_URL || 'https://api.sumup.com/v0.1';
  }

  /**
   * Create a checkout session (online payment)
   */
  async createCheckout(payment: PaymentRequest): Promise<SumUpCheckout> {
    try {
      const response = await fetch(`${this.baseUrl}/checkouts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          checkout_reference: payment.orderId,
          amount: payment.amount,
          currency: payment.currency,
          merchant_code: this.merchantCode,
          description: payment.description,
          return_url: `${process.env.APP_URL}/payment/success`,
          redirect_url: `${process.env.APP_URL}/payment/callback`,
        }),
      });

      if (!response.ok) {
        throw new Error(`SumUp API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data as SumUpCheckout;
    } catch (error) {
      console.error('SumUp createCheckout error:', error);
      throw error;
    }
  }

  /**
   * Process a checkout (complete payment)
   */
  async processCheckout(checkoutId: string, paymentType: string = 'card'): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/checkouts/${checkoutId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payment_type: paymentType,
        }),
      });

      if (!response.ok) {
        throw new Error(`SumUp API error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('SumUp processCheckout error:', error);
      throw error;
    }
  }

  /**
   * Get checkout status
   */
  async getCheckoutStatus(checkoutId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/checkouts/${checkoutId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`SumUp API error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('SumUp getCheckoutStatus error:', error);
      throw error;
    }
  }

  /**
   * List all checkouts for a merchant
   */
  async listCheckouts(checkoutReference?: string): Promise<any[]> {
    try {
      const url = checkoutReference
        ? `${this.baseUrl}/checkouts?checkout_reference=${checkoutReference}`
        : `${this.baseUrl}/checkouts`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`SumUp API error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('SumUp listCheckouts error:', error);
      throw error;
    }
  }

  /**
   * Create a terminal checkout (for SumUp 3G via Cloud API)
   */
  async createTerminalCheckout(payment: PaymentRequest): Promise<SumUpCheckout> {
    try {
      const response = await fetch(`${this.baseUrl}/checkouts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          checkout_reference: payment.orderId,
          amount: payment.amount,
          currency: payment.currency,
          merchant_code: this.merchantCode,
          description: payment.description,
          // Cloud API specific for Terminal
          reader_id: this.readerId,
          affiliate_key: this.affiliateKey,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SumUp Terminal API error: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`✅ Payment sent to SumUp 3G Terminal: ${this.readerId}`);
      return data as SumUpCheckout;
    } catch (error) {
      console.error('SumUp Terminal checkout error:', error);
      throw error;
    }
  }

  /**
   * Get terminal status (online/offline/busy)
   */
  async getTerminalStatus(): Promise<{
    reader_id: string;
    status: 'online' | 'offline' | 'busy';
    battery_level?: number;
    last_seen?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/readers/${this.readerId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`SumUp API error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('SumUp getTerminalStatus error:', error);
      throw error;
    }
  }

  /**
   * Pair a new terminal (get reader_id from pairing code)
   */
  async pairTerminal(pairingCode: string): Promise<{
    reader_id: string;
    name: string;
    status: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/readers/pair`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pairing_code: pairingCode,
        }),
      });

      if (!response.ok) {
        throw new Error(`SumUp API error: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`✅ Terminal paired successfully: ${data.reader_id}`);
      return data;
    } catch (error) {
      console.error('SumUp pairTerminal error:', error);
      throw error;
    }
  }
}

/**
 * RaiseNow Payment Integration
 * For TWINT payments via QR codes and PayLinks
 */
export class RaiseNowPayment {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private webhookSecret: string;

  constructor() {
    this.apiKey = process.env.RAISENOW_API_KEY || '';
    this.apiSecret = process.env.RAISENOW_API_SECRET || '';
    this.baseUrl = process.env.RAISENOW_BASE_URL || 'https://api.raisenow.com/v1';
    this.webhookSecret = process.env.RAISENOW_WEBHOOK_SECRET || '';
  }

  /**
   * Create a PayLink for TWINT payment
   */
  async createPayLink(payment: PaymentRequest): Promise<RaiseNowPayLink> {
    try {
      const response = await fetch(`${this.baseUrl}/paylinks`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(payment.amount * 100), // Convert to cents
          currency: payment.currency,
          purpose: payment.description,
          reference: payment.orderId,
          payment_methods: ['twint'],
          success_url: `${process.env.APP_URL}/payment/success?order=${payment.orderId}`,
          cancel_url: `${process.env.APP_URL}/payment/cancel`,
          stored_customer_firstname: 'Gast',
          stored_customer_lastname: `Tisch ${payment.tableNumber}`,
          stored_customer_email: payment.customerEmail || 'gast@fwv-raura.ch',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`RaiseNow API error: ${response.statusText} - ${error}`);
      }

      const data = await response.json();
      return {
        paylink_url: data.paylink_url,
        qr_code_url: data.qr_code_url,
        reference: data.reference,
      };
    } catch (error) {
      console.error('RaiseNow createPayLink error:', error);
      throw error;
    }
  }

  /**
   * Create a TWINT QR code with fixed amount
   */
  async createTwintQR(payment: PaymentRequest): Promise<string> {
    try {
      // RaiseNow TWINT QR format
      const qrPayload = {
        touchpoint_id: process.env.RAISENOW_TOUCHPOINT_ID || '',
        amount: Math.round(payment.amount * 100),
        purpose: payment.description,
        reference: payment.orderId,
      };

      const response = await fetch(`${this.baseUrl}/twint/qr`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(qrPayload),
      });

      if (!response.ok) {
        throw new Error(`RaiseNow API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.qr_code_data; // Base64 or URL
    } catch (error) {
      console.error('RaiseNow createTwintQR error:', error);
      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Parse webhook event
   */
  parseWebhookEvent(payload: any): {
    type: string;
    reference: string;
    status: string;
    amount: number;
  } {
    return {
      type: payload.event_type,
      reference: payload.transaction.reference,
      status: payload.transaction.status,
      amount: payload.transaction.amount / 100, // Convert from cents
    };
  }
}

/**
 * Unified Payment Service
 * Handles both SumUp and RaiseNow payments
 */
export class PaymentService {
  private sumup: SumUpPayment;
  private raisenow: RaiseNowPayment;

  constructor() {
    this.sumup = new SumUpPayment();
    this.raisenow = new RaiseNowPayment();
  }

  /**
   * Create payment based on provider preference
   */
  async createPayment(
    payment: PaymentRequest,
    provider: 'sumup' | 'raisenow' | 'twint'
  ): Promise<any> {
    if (provider === 'sumup') {
      return await this.sumup.createCheckout(payment);
    } else if (provider === 'raisenow' || provider === 'twint') {
      return await this.raisenow.createPayLink(payment);
    } else {
      throw new Error(`Unknown payment provider: ${provider}`);
    }
  }

  /**
   * Check payment status
   */
  async checkPaymentStatus(
    paymentId: string,
    provider: 'sumup' | 'raisenow'
  ): Promise<any> {
    if (provider === 'sumup') {
      return await this.sumup.getCheckoutStatus(paymentId);
    } else {
      // RaiseNow status is handled via webhooks
      throw new Error('RaiseNow status must be checked via webhooks');
    }
  }

  /**
   * Get payment URL for customer
   */
  getPaymentUrl(checkoutId: string, provider: 'sumup' | 'raisenow'): string {
    if (provider === 'sumup') {
      return `https://pay.sumup.com/checkout/${checkoutId}`;
    } else {
      // RaiseNow returns direct URL
      return checkoutId; // Already a URL
    }
  }
}

export default PaymentService;
