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
import { SUPER_ADMIN_EMAIL } from '../services/subscriptionService';

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
  receipt_printing: 'ask' | 'automatic' | 'none';
  receipt_paper_width_mm:58|80; receipt_left_padding_mm:number; receipt_right_padding_mm:number; receipt_top_padding_mm:number; receipt_bottom_padding_mm:number; receipt_font_size_px:number; receipt_show_logo:boolean; receipt_show_customer:boolean; receipt_show_barcode:boolean; receipt_show_return_policy:boolean;
  barcode_label_width_mm:number; barcode_label_height_mm:number; barcode_orientation:'portrait'|'landscape'; barcode_horizontal_offset_mm:number; barcode_vertical_offset_mm:number; barcode_width:number; barcode_height:number; barcode_show_product_name:boolean;
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
          receipt_printing: nextSettings.receipt_printing || 'automatic',
          receipt_paper_width_mm:nextSettings.receipt_paper_width_mm??80,receipt_left_padding_mm:Number(nextSettings.receipt_left_padding_mm??4),receipt_right_padding_mm:Number(nextSettings.receipt_right_padding_mm??4),receipt_top_padding_mm:Number(nextSettings.receipt_top_padding_mm??2),receipt_bottom_padding_mm:Number(nextSettings.receipt_bottom_padding_mm??2),receipt_font_size_px:Number(nextSettings.receipt_font_size_px??11),receipt_show_logo:nextSettings.receipt_show_logo??false,receipt_show_customer:nextSettings.receipt_show_customer??true,receipt_show_barcode:nextSettings.receipt_show_barcode??false,receipt_show_return_policy:nextSettings.receipt_show_return_policy??true,
          barcode_label_width_mm:Number(nextSettings.barcode_label_width_mm??50),barcode_label_height_mm:Number(nextSettings.barcode_label_height_mm??30),barcode_orientation:nextSettings.barcode_orientation??'portrait',barcode_horizontal_offset_mm:Number(nextSettings.barcode_horizontal_offset_mm??0),barcode_vertical_offset_mm:Number(nextSettings.barcode_vertical_offset_mm??0),barcode_width:Number(nextSettings.barcode_width??1.35),barcode_height:Number(nextSettings.barcode_height??38),barcode_show_product_name:nextSettings.barcode_show_product_name??false,
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
      receipt_printing: values.receipt_printing,
      receipt_paper_width_mm:Number(values.receipt_paper_width_mm) as 58|80,receipt_left_padding_mm:Number(values.receipt_left_padding_mm),receipt_right_padding_mm:Number(values.receipt_right_padding_mm),receipt_top_padding_mm:Number(values.receipt_top_padding_mm),receipt_bottom_padding_mm:Number(values.receipt_bottom_padding_mm),receipt_font_size_px:Number(values.receipt_font_size_px),receipt_show_logo:Boolean(values.receipt_show_logo),receipt_show_customer:Boolean(values.receipt_show_customer),receipt_show_barcode:Boolean(values.receipt_show_barcode),receipt_show_return_policy:Boolean(values.receipt_show_return_policy),
      barcode_label_width_mm:Number(values.barcode_label_width_mm),barcode_label_height_mm:Number(values.barcode_label_height_mm),barcode_orientation:values.barcode_orientation,barcode_horizontal_offset_mm:Number(values.barcode_horizontal_offset_mm),barcode_vertical_offset_mm:Number(values.barcode_vertical_offset_mm),barcode_width:Number(values.barcode_width),barcode_height:Number(values.barcode_height),barcode_show_product_name:Boolean(values.barcode_show_product_name),
    });

    if (updateError) {
      setError(getErrorMessage(updateError));
      return;
    }

    setSettings(data as StoreSettings);
    setSuccess('Settings updated successfully.');
  };

  const handleRoleChange = async (userId: string, role: UserRole) => {
    const selectedUser = users.find((user) => user.id === userId);
    if (selectedUser?.email?.toLowerCase() === SUPER_ADMIN_EMAIL) {
      setError('The super-admin account cannot be edited or downgraded.');
      return;
    }
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
                <Select label="Receipt Printing" {...register('receipt_printing')}>
                  <option value="automatic">Automatically Open Print Dialog</option><option value="ask">Ask Before Printing</option><option value="none">Do Not Print</option>
                </Select>
                <Select label="Receipt Paper Width" {...register('receipt_paper_width_mm',{valueAsNumber:true})}><option value="58">58mm</option><option value="80">80mm</option></Select>
                <Input type="number" step="0.5" label="Receipt Font Size (px)" {...register('receipt_font_size_px',{valueAsNumber:true})}/><Input type="number" step="0.5" label="Left Padding (mm)" {...register('receipt_left_padding_mm',{valueAsNumber:true})}/><Input type="number" step="0.5" label="Right Padding (mm)" {...register('receipt_right_padding_mm',{valueAsNumber:true})}/><Input type="number" step="0.5" label="Top Padding (mm)" {...register('receipt_top_padding_mm',{valueAsNumber:true})}/><Input type="number" step="0.5" label="Bottom Padding (mm)" {...register('receipt_bottom_padding_mm',{valueAsNumber:true})}/>
                <label className="flex items-center gap-3 text-sm text-dashboard-text-label"><input type="checkbox" {...register('receipt_show_logo')}/> Show store logo</label><label className="flex items-center gap-3 text-sm text-dashboard-text-label"><input type="checkbox" {...register('receipt_show_customer')}/> Show customer</label><label className="flex items-center gap-3 text-sm text-dashboard-text-label"><input type="checkbox" {...register('receipt_show_barcode')}/> Show barcode</label><label className="flex items-center gap-3 text-sm text-dashboard-text-label"><input type="checkbox" {...register('receipt_show_return_policy')}/> Show return policy</label>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                <Save size={16} />
                {isSubmitting ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
            <div className="border-t border-white/10 pt-6"><h3 className="text-lg font-semibold text-dashboard-text-primary">Barcode Printer</h3><p className="mt-1 text-sm text-dashboard-text-sub">Physical label dimensions and Zebra-style printer alignment.</p><div className="mt-4 grid gap-4 md:grid-cols-2"><Input type="number" step="0.1" label="Label Width (mm)" {...register('barcode_label_width_mm',{valueAsNumber:true})}/><Input type="number" step="0.1" label="Label Height (mm)" {...register('barcode_label_height_mm',{valueAsNumber:true})}/><Select label="Orientation" {...register('barcode_orientation')}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></Select><Input type="number" step="0.1" label="Horizontal Offset (mm)" {...register('barcode_horizontal_offset_mm',{valueAsNumber:true})}/><Input type="number" step="0.1" label="Vertical Offset (mm)" {...register('barcode_vertical_offset_mm',{valueAsNumber:true})}/><Input type="number" step="0.05" label="Barcode Width" {...register('barcode_width',{valueAsNumber:true})}/><Input type="number" step="1" label="Barcode Height" {...register('barcode_height',{valueAsNumber:true})}/><label className="flex items-center gap-3 text-sm text-dashboard-text-label"><input type="checkbox" {...register('barcode_show_product_name')}/> Show product name on label</label></div></div>
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
                    {user.email?.toLowerCase() === SUPER_ADMIN_EMAIL ? (
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-dashboard-accent/30 bg-dashboard-accent/10 px-3 py-1.5 text-xs font-semibold text-dashboard-accent">Super Admin</span>
                        <span className="text-xs text-dashboard-text-sub">Locked</span>
                      </div>
                    ) : (
                      <Select value={user.role} onChange={(event) => void handleRoleChange(user.id, event.target.value as UserRole)} className="max-w-[180px]">
                        <option value="admin">Admin</option>
                        <option value="cashier">Cashier</option>
                      </Select>
                    )}
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
