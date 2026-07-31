import { useCallback, useEffect, useState } from 'react';
import { Save, Shield } from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { Profile, StoreSettings, UserRole } from '../types';
import * as settingsService from '../services/settingsService';
import * as userService from '../services/userService';
import { getErrorMessage } from '../utils/errors';
import {
  Alert,
  Button,
  Input,
  LoadingSpinner,
  PageHeader,
  Select,
  Textarea,
} from '../components/ui';

interface SettingsFormValues {
  store_name: string;
  logo_url: string;
  address: string;
  phone: string;
  email: string;
  receipt_footer: string;
  currency_code: string;
  tax_percentage: number;
  invoice_prefix: string;
  default_low_stock_limit: number;
}

export function Settings() {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<SettingsFormValues>();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [settingsResult, usersResult] = await Promise.all([
      settingsService.getStoreSettings(),
      userService.getUsers(),
    ]);

    if (settingsResult.error || usersResult.error) {
      setError(getErrorMessage(settingsResult.error ?? usersResult.error));
    } else {
      const nextSettings = (settingsResult.data as StoreSettings | null) ?? null;
      setSettings(nextSettings);
      setUsers((usersResult.data as Profile[]) ?? []);
      if (nextSettings) {
        reset({
          store_name: nextSettings.store_name,
          logo_url: nextSettings.logo_url || '',
          address: nextSettings.address || '',
          phone: nextSettings.phone || '',
          email: nextSettings.email || '',
          receipt_footer: nextSettings.receipt_footer || '',
          currency_code: nextSettings.currency_code,
          tax_percentage: Number(nextSettings.tax_percentage),
          invoice_prefix: nextSettings.invoice_prefix,
          default_low_stock_limit: nextSettings.default_low_stock_limit,
        });
      }
    }
    setLoading(false);
  }, [reset]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onSubmit = async (values: SettingsFormValues) => {
    if (!settings) return;
    setError(null);
    setSuccess(null);
    const { data, error: updateError } = await settingsService.updateStoreSettings(settings.id, {
      store_name: values.store_name,
      logo_url: values.logo_url || null,
      address: values.address || null,
      phone: values.phone || null,
      email: values.email || null,
      receipt_footer: values.receipt_footer || null,
      currency_code: values.currency_code,
      tax_percentage: Number(values.tax_percentage),
      invoice_prefix: values.invoice_prefix,
      default_low_stock_limit: Number(values.default_low_stock_limit),
    });

    if (updateError) {
      setError(getErrorMessage(updateError));
      return;
    }

    setSettings(data as StoreSettings);
    setSuccess('Settings updated successfully.');
  };

  const handleRoleChange = async (userId: string, role: UserRole) => {
    setError(null);
    setSuccess(null);
    const { error: updateError } = await userService.updateUserRole(userId, role);
    if (updateError) {
      setError(getErrorMessage(updateError));
      return;
    }
    setUsers((current) => current.map((user) => (user.id === userId ? { ...user, role } : user)));
    setSuccess('User role updated successfully.');
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Store details, business rules, and user access control."
      />

      {error && <Alert message={error} />}
      {success && <Alert message={success} />}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <form onSubmit={handleSubmit(onSubmit)} className="glass-card p-6">
          <div className="relative z-10 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-dashboard-text-primary">Store Settings</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Input label="Store Name" error={errors.store_name?.message} {...register('store_name', { required: 'Store name is required' })} />
                <Input label="Logo URL" {...register('logo_url')} />
                <Input label="Phone" {...register('phone')} />
                <Input label="Email" type="email" {...register('email')} />
              </div>
              <div className="mt-4">
                <Textarea label="Address" rows={3} {...register('address')} />
              </div>
              <div className="mt-4">
                <Textarea label="Receipt Footer" rows={3} {...register('receipt_footer')} />
              </div>
            </div>

            <div className="border-t border-white/10 pt-6">
              <h3 className="text-lg font-semibold text-dashboard-text-primary">Business Settings</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Input label="Currency" {...register('currency_code', { required: 'Currency is required' })} />
                <Input type="number" step="0.01" label="Tax Percentage" {...register('tax_percentage', { valueAsNumber: true })} />
                <Input label="Invoice Prefix" {...register('invoice_prefix', { required: 'Invoice prefix is required' })} />
                <Input type="number" label="Default Low Stock Limit" {...register('default_low_stock_limit', { valueAsNumber: true })} />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                <Save size={16} />
                {isSubmitting ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </div>
        </form>

        <div className="glass-card p-6">
          <div className="relative z-10">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-dashboard-accent/20 text-dashboard-text-primary">
                <Shield size={18} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-dashboard-text-primary">User Management</h3>
                <p className="text-sm text-dashboard-text-sub">Admin has full access. Cashier can access Dashboard, Customers, POS, and Sales.</p>
              </div>
            </div>

            <div className="space-y-3">
              {users.map((user) => (
                <div key={user.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium text-dashboard-text-primary">{user.full_name || user.email || 'Unnamed User'}</p>
                      <p className="text-xs text-dashboard-text-sub">{user.email || '-'}</p>
                    </div>
                    <Select value={user.role} onChange={(event) => void handleRoleChange(user.id, event.target.value as UserRole)} className="max-w-[180px]">
                      <option value="admin">Admin</option>
                      <option value="cashier">Cashier</option>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
