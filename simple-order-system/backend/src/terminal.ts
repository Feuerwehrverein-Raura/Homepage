import fetch from 'node-fetch';

/**
 * SumUp Terminal Integration (Cloud API)
 * For direct control of SumUp Solo card readers
 */
export class SumUpTerminal {
  private apiKey: string;
  private affiliateKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.SUMUP_API_KEY || '';
    this.affiliateKey = process.env.SUMUP_AFFILIATE_KEY || '';
    this.baseUrl = 'https://api.sumup.com/v0.1';
  }

  /**
   * Pair a Solo reader with your SumUp account
   * The reader must be in pairing mode (display shows pairing code)
   */
  async pairReader(pairingCode: string): Promise<{
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

      return await response.json() as { reader_id: string; name: string; status: string };
    } catch (error) {
      console.error('SumUp pairReader error:', error);
      throw error;
    }
  }

  /**
   * List all paired readers
   */
  async listReaders(): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/readers`, {
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
      console.error('SumUp listReaders error:', error);
      throw error;
    }
  }

  /**
   * Start a checkout on a specific reader
   * The reader will display the payment amount and wait for card
   */
  async startCheckoutOnReader(
    readerId: string,
    amount: number,
    currency: string = 'CHF',
    checkoutReference: string,
    description?: string
  ): Promise<{
    checkout_id: string;
    status: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/checkouts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amount,
          currency: currency,
          checkout_reference: checkoutReference,
          description: description,
          merchant_code: process.env.SUMUP_MERCHANT_CODE,
          pay_to_email: process.env.SUMUP_MERCHANT_EMAIL,
          // Cloud API specific
          reader_id: readerId,
          affiliate_key: this.affiliateKey,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`SumUp API error: ${response.statusText} - ${error}`);
      }

      return await response.json() as { checkout_id: string; status: string };
    } catch (error) {
      console.error('SumUp startCheckoutOnReader error:', error);
      throw error;
    }
  }

  /**
   * Check checkout status on reader
   */
  async getCheckoutStatus(checkoutId: string): Promise<{
    id: string;
    status: string;
    amount: number;
    currency: string;
    timestamp: string;
    transaction_code?: string;
  }> {
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

      return await response.json() as {
        id: string;
        status: string;
        amount: number;
        currency: string;
        timestamp: string;
        transaction_code?: string;
      };
    } catch (error) {
      console.error('SumUp getCheckoutStatus error:', error);
      throw error;
    }
  }

  /**
   * Cancel an ongoing checkout on reader
   */
  async cancelCheckout(checkoutId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/checkouts/${checkoutId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`SumUp API error: ${response.statusText}`);
      }
    } catch (error) {
      console.error('SumUp cancelCheckout error:', error);
      throw error;
    }
  }

  /**
   * Get reader status (online/offline/busy)
   */
  async getReaderStatus(readerId: string): Promise<{
    reader_id: string;
    name: string;
    status: 'online' | 'offline' | 'busy';
    battery_level?: number;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/readers/${readerId}`, {
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
        name: string;
        status: 'online' | 'offline' | 'busy';
        battery_level?: number;
      };
    } catch (error) {
      console.error('SumUp getReaderStatus error:', error);
      throw error;
    }
  }

  /**
   * Assign a name to a reader (for easier identification)
   */
  async setReaderName(readerId: string, name: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/readers/${readerId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name,
        }),
      });

      if (!response.ok) {
        throw new Error(`SumUp API error: ${response.statusText}`);
      }
    } catch (error) {
      console.error('SumUp setReaderName error:', error);
      throw error;
    }
  }
}

export default SumUpTerminal;
