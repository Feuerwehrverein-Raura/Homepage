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

      return await response.json() as any[];
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

      return await response.json() as {
        reader_id: string;
        status: 'online' | 'offline' | 'busy';
        battery_level?: number;
        last_seen?: string;
      };
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

      const data = await response.json() as { reader_id: string; name: string; status: string };
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
 * For TWINT payments via PayLinks with URL parameters (no API key needed)
 */
export class RaiseNowPayment {
  private paylinkBase: string;
  private webhookSecret: string;

  constructor() {
    // Use PayLink base URL - no API credentials needed!
    // Example: https://pay.raisenow.io/bddht
    this.paylinkBase = process.env.RAISENOW_PAYLINK_BASE || '';
    this.webhookSecret = process.env.RAISENOW_WEBHOOK_SECRET || '';
  }

  /**
   * Create a PayLink URL for TWINT payment using URL parameters
   * No API credentials needed - just the base PayLink URL
   */
  async createPayLink(payment: PaymentRequest): Promise<RaiseNowPayLink> {
    if (!this.paylinkBase) {
      throw new Error('RAISENOW_PAYLINK_BASE not configured. Set it to your PayLink URL (e.g., https://pay.raisenow.io/xxxxx)');
    }

    // Amount in Rappen (cents)
    const amountInCents = Math.round(payment.amount * 100);

    // Build PayLink URL with parameters
    // Documentation: https://support.raisenow.com/hc/en-us/articles/4416934103953
    const params = new URLSearchParams({
      'rnw-amount': amountInCents.toString(),
      'rnw-payment_method': 'twint',
      'rnw-stored_customer_firstname': 'Gast',
      'rnw-stored_customer_lastname': `Tisch ${payment.tableNumber}`,
      'rnw-stored_customer_message': payment.description,
      'rnw-stored_campaign_id': payment.orderId,
    });

    const paylinkUrl = `${this.paylinkBase}?${params.toString()}`;

    // Generate QR code URL using free QR code API
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paylinkUrl)}`;

    console.log(`✅ TWINT PayLink created: ${paylinkUrl}`);

    return {
      paylink_url: paylinkUrl,
      qr_code_url: qrCodeUrl,
      reference: payment.orderId,
    };
  }

  /**
   * Create a TWINT QR code - uses PayLink approach
   */
  async createTwintQR(payment: PaymentRequest): Promise<string> {
    const paylink = await this.createPayLink(payment);
    return paylink.qr_code_url;
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
  public sumup: SumUpPayment;
  public raisenow: RaiseNowPayment;

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
