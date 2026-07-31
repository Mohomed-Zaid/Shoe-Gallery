import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Eye, Plus, Search, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import type { Customer } from '../types';
import * as customerService from '../services/customerService';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency, formatDate } from '../utils/format';
import {
  Alert,
  Button,
  DataTable,
  Input,
  LoadingSpinner,
  Modal,
  PageHeader,
  Pagination,
  Textarea,
} from '../components/ui';

interface CustomerFormValues {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

export function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CustomerFormValues>();

  const pageSize = 8;
  const totalPages = useMemo(() => Math.max(Math.ceil(totalCount / pageSize), 1), [totalCount]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, count, error: fetchError } = await customerService.getCustomers({ page, pageSize, search });
    if (fetchError) {
      setError(getErrorMessage(fetchError));
    } else {
      setCustomers((data as Customer[]) ?? []);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [page, pageSize, search]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const openCreateModal = () => {
    setEditingCustomer(null);
    reset({
      name: '',
      phone: '',
      email: '',
      address: '',
      notes: '',
    });
    setShowModal(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    reset({
      name: customer.name,
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      address: customer.address ?? '',
      notes: customer.notes ?? '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingCustomer(null);
    reset();
  };

  const onSubmit = async (values: CustomerFormValues) => {
    setError(null);
    const payload = {
      name: values.name,
      phone: values.phone || null,
      email: values.email || null,
      address: values.address || null,
      notes: values.notes || null,
    };

    const result = editingCustomer
      ? await customerService.updateCustomer(editingCustomer.id, payload)
      : await customerService.createCustomer(payload);

    if (result.error) {
      setError(getErrorMessage(result.error));
      return;
    }

    closeModal();
    fetchCustomers();
  };

  const handleDelete = async (customer: Customer) => {
    if (!confirm(`Delete ${customer.name}?`)) return;
    const { error: deleteError } = await customerService.deleteCustomer(customer.id);
    if (deleteError) {
      setError(getErrorMessage(deleteError));
      return;
    }
    fetchCustomers();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Manage customer profiles, balances, and purchase history."
        action={
          <Button onClick={openCreateModal}>
            <Plus size={18} />
            Add Customer
          </Button>
        }
      />

      {error && <Alert message={error} />}

      <div className="glass-card p-4">
        <div className="relative z-10 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dashboard-text-sub" size={16} />
          <Input
            placeholder="Search by name, phone, or email"
            className="pl-10"
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
          />
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <DataTable
            columns={[
              { key: 'name', header: 'Customer' },
              { key: 'phone', header: 'Phone' },
              { key: 'email', header: 'Email' },
              { key: 'balance', header: 'Outstanding' },
              { key: 'created', header: 'Joined' },
              { key: 'actions', header: 'Actions', className: 'text-right' },
            ]}
            isEmpty={customers.length === 0}
            emptyMessage="No customers found."
          >
            {customers.map((customer) => (
              <tr key={customer.id} className="hover:bg-dashboard-hover">
                <td className="px-6 py-4">
                  <div>
                    <p className="font-medium text-dashboard-text-primary">{customer.name}</p>
                    <p className="text-xs text-dashboard-text-sub">{customer.address || 'No address added'}</p>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-dashboard-text-sub">{customer.phone || '-'}</td>
                <td className="px-6 py-4 text-sm text-dashboard-text-sub">{customer.email || '-'}</td>
                <td className="px-6 py-4 text-sm font-medium text-dashboard-text-primary">
                  {formatCurrency(Number(customer.outstanding_balance ?? 0))}
                </td>
                <td className="px-6 py-4 text-sm text-dashboard-text-sub">{formatDate(customer.created_at)}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link to={`/customers/${customer.id}`} className="text-dashboard-text-sub hover:text-dashboard-text-primary">
                      <Eye size={18} />
                    </Link>
                    <button type="button" onClick={() => openEditModal(customer)} className="text-dashboard-text-sub hover:text-dashboard-text-primary">
                      <Edit2 size={18} />
                    </button>
                    <button type="button" onClick={() => handleDelete(customer)} className="text-red-400 hover:text-red-300">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>

          <div className="glass-card p-4">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </>
      )}

      {showModal && (
        <Modal title={editingCustomer ? 'Edit Customer' : 'Add Customer'} onClose={closeModal}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Name" error={errors.name?.message} {...register('name', { required: 'Name is required' })} />
            <Input label="Phone" {...register('phone')} />
            <Input label="Email" type="email" {...register('email')} />
            <Textarea label="Address" rows={3} {...register('address')} />
            <Textarea label="Notes" rows={3} {...register('notes')} />

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : editingCustomer ? 'Update Customer' : 'Create Customer'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
