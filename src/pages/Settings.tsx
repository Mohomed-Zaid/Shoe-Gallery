import { useCallback, useEffect, useState } from 'react';
import { Download, Monitor, Printer, Save, Shield } from 'lucide-react';
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
import { usePWAInstall } from '../pwa/install';
import { printReceiptQualityTest, printReceiptWidthTest } from '../services/receiptPrintService';
import {
  getReceiptPrintingMode,
  getReceiptPrintStyle,
  setReceiptPrintingMode,
  setReceiptPrintStyle,
  type ReceiptPrintingMode,
  type ReceiptPrintStyle,
} from '../services/receiptPrintStyle';
import {
  getBarcodePrintDensity,
  setBarcodePrintDensity,
  type BarcodePrintDensity,
} from '../services/barcodeLabelPrintService';

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
  receipt_paper_width_mm:58|80; receipt_printable_width_mm:number; receipt_orientation:'portrait'|'landscape'; receipt_left_padding_mm:number; receipt_right_padding_mm:number; receipt_top_padding_mm:number; receipt_bottom_padding_mm:number; receipt_font_size_px:number; receipt_horizontal_offset_mm:number; receipt_show_logo:boolean; receipt_show_customer:boolean; receipt_show_barcode:boolean; receipt_show_return_policy:boolean;
  receipt_print_style: ReceiptPrintStyle;
  receipt_printing_mode: ReceiptPrintingMode;
  barcode_horizontal_offset_mm:number; barcode_vertical_offset_mm:number; barcode_width:number; barcode_height:number;
  barcode_print_density: BarcodePrintDensity;
}

function normaliseBarcodeWidth(value: number | undefined) {
  const width = Number(value);
  return Number.isFinite(width) && width >= 0.8 && width <= 1 ? width : 1;
}

function normaliseBarcodeHeight(value: number | undefined) {
  const height = Number(value);
  return [24, 28, 32, 36, 40].includes(height) ? height : 36;
}

export function Settings() {
  const pwa = usePWAInstall();
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
          receipt_printing: nextSettings.receipt_printing === 'none' ? 'none' : 'automatic',
          receipt_paper_width_mm: nextSettings.receipt_paper_width_mm ?? 80,
          receipt_printable_width_mm: Number(nextSettings.receipt_printable_width_mm ?? 72),
          receipt_orientation: nextSettings.receipt_orientation ?? 'landscape',
          receipt_left_padding_mm: Number(nextSettings.receipt_left_padding_mm) === 4 && Number(nextSettings.receipt_right_padding_mm) === 4 ? 2 : Number(nextSettings.receipt_left_padding_mm ?? 2),
          receipt_right_padding_mm: Number(nextSettings.receipt_left_padding_mm) === 4 && Number(nextSettings.receipt_right_padding_mm) === 4 ? 3 : Number(nextSettings.receipt_right_padding_mm ?? 3),
          receipt_top_padding_mm: Number(nextSettings.receipt_top_padding_mm ?? 2),
          receipt_bottom_padding_mm: Math.min(3, Math.max(0, Number(nextSettings.receipt_bottom_padding_mm ?? 1))),
          receipt_font_size_px: Math.min(14, Math.max(11, Number(nextSettings.receipt_font_size_px ?? 11))),
          receipt_horizontal_offset_mm: Number(nextSettings.receipt_horizontal_offset_mm ?? 0),
          receipt_show_logo: nextSettings.receipt_show_logo ?? false,
          receipt_show_customer: nextSettings.receipt_show_customer ?? true,
          receipt_show_barcode: nextSettings.receipt_show_barcode ?? false,
          receipt_show_return_policy: nextSettings.receipt_show_return_policy ?? true,
          receipt_print_style: getReceiptPrintStyle(),
          receipt_printing_mode: getReceiptPrintingMode(),
          barcode_horizontal_offset_mm:Number(nextSettings.barcode_horizontal_offset_mm??0),barcode_vertical_offset_mm:Number(nextSettings.barcode_vertical_offset_mm??0),barcode_width:normaliseBarcodeWidth(nextSettings.barcode_width),barcode_height:normaliseBarcodeHeight(nextSettings.barcode_height),
          barcode_print_density: getBarcodePrintDensity(),
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
      receipt_paper_width_mm: Number(values.receipt_paper_width_mm) as 58 | 80,
      receipt_printable_width_mm: Number(values.receipt_printable_width_mm),
      receipt_orientation: values.receipt_orientation,
      receipt_left_padding_mm: Number(values.receipt_left_padding_mm),
      receipt_right_padding_mm: Number(values.receipt_right_padding_mm),
      receipt_top_padding_mm: Number(values.receipt_top_padding_mm),
      receipt_bottom_padding_mm: Number(values.receipt_bottom_padding_mm),
      receipt_font_size_px: Number(values.receipt_font_size_px),
      receipt_horizontal_offset_mm: Number(values.receipt_horizontal_offset_mm),
      receipt_show_logo: Boolean(values.receipt_show_logo),
      receipt_show_customer: Boolean(values.receipt_show_customer),
      receipt_show_barcode: Boolean(values.receipt_show_barcode),
      receipt_show_return_policy: Boolean(values.receipt_show_return_policy),
      barcode_horizontal_offset_mm:Number(values.barcode_horizontal_offset_mm),barcode_vertical_offset_mm:Number(values.barcode_vertical_offset_mm),barcode_width:Number(values.barcode_width),barcode_height:Number(values.barcode_height),
    });

    if (updateError) {
      setError(getErrorMessage(updateError));
      return;
    }

    setReceiptPrintStyle(values.receipt_print_style);
    setReceiptPrintingMode(values.receipt_printing_mode);
    setBarcodePrintDensity(values.barcode_print_density);
    setSettings(data as StoreSettings);
    setSuccess('Settings updated successfully.');
  };

  const handleReceiptWidthTest = () => {
    setError(null);
    setSuccess(null);
    try {
      printReceiptWidthTest();
    } catch (printError) {
      setError(getErrorMessage(printError, 'Unable to open receipt width test.'));
    }
  };

  const handleReceiptQualityTest = () => {
    setError(null);
    setSuccess(null);
    try {
      printReceiptQualityTest();
    } catch (printError) {
      setError(getErrorMessage(printError, 'Unable to open receipt quality test.'));
    }
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

      {!pwa.isInstalled && (
        <div className="glass-card flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="relative z-10">
            <p className="font-semibold text-dashboard-text-primary">Shoe Gallery POS Desktop App</p>
            <p className="text-sm text-dashboard-text-sub">{pwa.canInstall ? 'Ready to install on this computer.' : 'Install support is preparing. Use Chrome or Edge and reload once.'}</p>
          </div>
          <Button className="relative z-10" type="button" disabled={!pwa.canInstall} onClick={async()=>{const installed=await pwa.install();if(installed)setSuccess('Shoe Gallery POS installed successfully.')}}><Download size={16}/>Install Desktop App</Button>
        </div>
      )}

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

            <div className="border-t border-white/10 pt-6">
              <h3 className="text-lg font-semibold text-dashboard-text-primary">Receipt Printer</h3>
              <p className="mt-1 text-sm text-dashboard-text-sub">
                Safe thermal-receipt width and edge calibration for the printer driver.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Select label="Auto Print After Sale" {...register('receipt_printing')}>
                  <option value="automatic">On</option>
                  <option value="none">Off</option>
                </Select>
                <Select label="Printing Mode" {...register('receipt_printing_mode')}>
                  <option value="browser">Browser Print</option>
                  <option value="silent">Silent / Kiosk Print</option>
                </Select>
                <Select label="Print Style" {...register('receipt_print_style')}>
                  <option value="normal">Normal</option>
                  <option value="dark">Dark (Recommended)</option>
                  <option value="extra-dark">Extra Dark</option>
                </Select>
                <Select
                  label="Paper Width"
                  {...register('receipt_paper_width_mm', { valueAsNumber: true })}
                >
                  <option value="58">58mm</option>
                  <option value="80">80mm</option>
                </Select>
                <Input
                  type="number"
                  min="48"
                  max="76"
                  step="1"
                  required
                  label="Printable Width (mm)"
                  {...register('receipt_printable_width_mm', { valueAsNumber: true })}
                />
                <Select label="Orientation" {...register('receipt_orientation')}>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </Select>
                <Input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  required
                  label="Left Padding (mm)"
                  {...register('receipt_left_padding_mm', { valueAsNumber: true })}
                />
                <Input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  required
                  label="Right Padding (mm)"
                  {...register('receipt_right_padding_mm', { valueAsNumber: true })}
                />
                <Input
                  type="number"
                  min="-5"
                  max="5"
                  step="0.5"
                  required
                  label="Horizontal Offset (mm)"
                  {...register('receipt_horizontal_offset_mm', { valueAsNumber: true })}
                />
                <Input
                  type="number"
                  min="11"
                  max="14"
                  step="0.5"
                  required
                  label="Receipt Font Size (px)"
                  {...register('receipt_font_size_px', { valueAsNumber: true })}
                />
                <Input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  required
                  label="Top Padding (mm)"
                  {...register('receipt_top_padding_mm', { valueAsNumber: true })}
                />
                <Input
                  type="number"
                  min="0"
                  max="3"
                  step="0.5"
                  required
                  label="Bottom Padding (mm)"
                  {...register('receipt_bottom_padding_mm', { valueAsNumber: true })}
                />
                <label className="flex items-center gap-3 text-sm text-dashboard-text-label">
                  <input type="checkbox" {...register('receipt_show_logo')} /> Show store logo
                </label>
                <label className="flex items-center gap-3 text-sm text-dashboard-text-label">
                  <input type="checkbox" {...register('receipt_show_customer')} /> Show customer
                </label>
                <label className="flex items-center gap-3 text-sm text-dashboard-text-label">
                  <input type="checkbox" {...register('receipt_show_barcode')} /> Show barcode
                </label>
                <label className="flex items-center gap-3 text-sm text-dashboard-text-label">
                  <input type="checkbox" {...register('receipt_show_return_policy')} /> Show return policy
                </label>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button type="button" variant="secondary" onClick={handleReceiptWidthTest}>
                  <Printer size={16} />
                  Print Width Test
                </Button>
                <Button type="button" variant="secondary" onClick={handleReceiptQualityTest}>
                  <Printer size={16} />
                  Print Quality Test
                </Button>
                <p className="text-xs text-dashboard-text-sub">
                  Calibration only. These tests do not create a sale.
                </p>
              </div>
              <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-relaxed text-dashboard-text-sub">
                For an 80mm roll, start with 72mm printable width, 2mm left padding, 3mm right padding,
                and 0mm horizontal offset. Print at 100% scale with zero/minimum driver margins. If the receipt prints too light, increase printer Darkness / Density in Windows printer preferences and reduce print speed slightly if characters are incomplete. If blank paper still feeds after the receipt, select continuous receipt-roll media instead of an A4 or fixed-length page and use the printer's minimum cut/feed setting.
                Silent / Kiosk Print uses the same safe <code>window.print()</code> flow and becomes dialog-free only when Chrome or Edge is launched with kiosk printing enabled.
              </div>
            </div>

            <div className="border-t border-white/10 pt-6">
              <h3 className="text-lg font-semibold text-dashboard-text-primary">Barcode Printer</h3>
              <p className="mt-1 text-sm text-dashboard-text-sub">30mm × 20mm labels with barcode and number only.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Input type="number" label="Label Width (mm)" value={30} readOnly/>
                <Input type="number" label="Label Height (mm)" value={20} readOnly/>
                <Input type="number" min="-3" max="3" step="0.1" required label="Horizontal Offset (mm)" {...register('barcode_horizontal_offset_mm',{valueAsNumber:true})}/>
                <Input type="number" min="-3" max="3" step="0.1" required label="Vertical Offset (mm)" {...register('barcode_vertical_offset_mm',{valueAsNumber:true})}/>
                <Input type="number" min="0.8" max="1" step="0.05" required label="Barcode Width" {...register('barcode_width',{valueAsNumber:true})}/>
                <Input type="number" min="24" max="40" step="4" required label="Barcode Height" {...register('barcode_height',{valueAsNumber:true})}/>
                <Select label="Print Density" {...register('barcode_print_density')}>
                  <option value="normal">Normal</option>
                  <option value="dark">Dark (Recommended)</option>
                  <option value="extra-dark">Extra Dark</option>
                </Select>
              </div>
              <p className="mt-3 text-xs text-dashboard-text-sub">Label dimensions are fixed. Barcode width, barcode height, and offset calibration apply only within the 30mm × 20mm label.</p>
              <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-relaxed text-dashboard-text-sub">
                <strong className="text-dashboard-text-primary">Select 30mm × 20mm in the printer driver for correct label printing.</strong>{' '}
                Use 100% scale and 0/minimum margins. If the barcode prints too light, increase Darkness / Density in the physical printer driver and reduce print speed slightly if thin bars disappear.
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

        <div className="space-y-6">
        <section className="glass-card p-6">
          <div className="relative z-10">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-dashboard-accent/20 text-dashboard-text-primary"><Monitor size={18} /></div>
              <div>
                <h3 className="text-lg font-semibold text-dashboard-text-primary">Customer Display Setup</h3>
                <p className="text-sm text-dashboard-text-sub">Use a second monitor for the read-only live bill.</p>
              </div>
            </div>
            <ol className="space-y-2 text-sm text-dashboard-text-sub">
              <li>1. Connect the second monitor.</li>
              <li>2. Press Windows + P and select <strong className="text-dashboard-text-primary">Extend</strong>.</li>
              <li>3. Open Shoe Gallery POS and click <strong className="text-dashboard-text-primary">Customer Display</strong>.</li>
              <li>4. Move the new window to monitor 2, then maximize it or choose Enter Full Screen.</li>
            </ol>
            <p className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-sm font-medium text-amber-100">
              For customer display, Windows display mode must be set to Extend, not Duplicate.
            </p>
          </div>
        </section>
        <section className="glass-card p-6"><div className="relative z-10"><div className="mb-4 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-dashboard-accent/20"><Download size={18}/></div><div><h3 className="text-lg font-semibold text-dashboard-text-primary">Desktop App</h3><p className="text-sm text-dashboard-text-sub">Install Shoe Gallery POS on this Windows computer.</p></div></div><div className="space-y-2 text-sm text-dashboard-text-sub"><p>1. Open Shoe Gallery POS in Chrome or Edge.</p><p>2. Click “Install Desktop App.”</p><p>3. Confirm installation.</p><p>4. Launch it from the desktop or Start menu.</p></div><div className="mt-4 grid gap-2 text-sm sm:grid-cols-2"><p><span className="text-dashboard-text-sub">Install status:</span> {pwa.isInstalled?'Installed':pwa.canInstall?'Available':'Not currently available'}</p><p><span className="text-dashboard-text-sub">App version:</span> {import.meta.env.VITE_APP_VERSION||'0.0.0'}</p><p><span className="text-dashboard-text-sub">Update status:</span> Updates are checked automatically</p><p><span className="text-dashboard-text-sub">Connection:</span> {navigator.onLine?'Online':'Offline'}</p></div>{pwa.canInstall&&<Button className="mt-5" type="button" onClick={async()=>{const installed=await pwa.install();if(installed)setSuccess('Shoe Gallery POS installed successfully.')}}><Download size={16}/>Install Desktop App</Button>}{!pwa.isInstalled&&!pwa.canInstall&&<p className="mt-4 text-xs text-dashboard-text-sub">If installation is supported, use the install icon in the Chrome or Edge address bar. Installation requires HTTPS in production.</p>}</div></section>
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
        </div></div>
      </div>
    </div>
  );
}
