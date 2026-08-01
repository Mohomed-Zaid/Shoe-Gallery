export type SubscriptionStatusValue = 'active' | 'expired' | 'suspended';

export interface SubscriptionStatus {
  status: SubscriptionStatusValue;
  activated_at: string;
  expires_at: string;
  server_time: string;
  days_remaining: number;
  is_expired: boolean;
  is_access_allowed: boolean;
}

export interface SubscriptionDetails extends SubscriptionStatus {
  last_payment_date: string | null;
  next_payment_date: string | null;
  suspended_reason: string | null;
}

export interface SubscriptionAuditLog {
  id: string;
  action: string;
  previous_status: SubscriptionStatusValue | null;
  new_status: SubscriptionStatusValue | null;
  previous_expiry: string | null;
  new_expiry: string | null;
  changed_by: string | null;
  changed_by_email: string | null;
  notes: string | null;
  created_at: string;
}
