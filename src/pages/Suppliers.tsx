import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { Supplier } from '../types';
import * as supplierService from '../services/supplierService';
import { getErrorMessage } from '../utils/errors';
import { formatDate } from '../utils/format';
import {
  Alert,
  Button,
  DataTable,
  Input,
  LoadingSpinner,
  Modal,
  PageHeader,
  Textarea,
} from '../components/ui';

interface SupplierFormInputs {
  name: string;
  phone: string;
  email: string;
  address: string;
}

export function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<SupplierFormInputs>();

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supplierService.getSuppliers();
    if (fetchError) {
      setError(getErrorMessage(fetchError));
    } else {
      setSuppliers((data as Supplier[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    reset();
  };

  const onSubmit = async (data: SupplierFormInputs) => {
    setError(null);
    const result = editingId
      ? await supplierService.updateSupplier(editingId, data)
      : await supplierService.createSupplier(data);

    if (result.error) {
      setError(getErrorMessage(result.error));
      return;
    }

    closeModal();
    fetchSuppliers();
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingId(supplier.id);
    reset({
      name: supplier.name,
      phone: supplier.phone ?? '',
      email: supplier.email ?? '',
      address: supplier.address ?? '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this supplier?')) return;
    const { error: deleteError } = await supplierService.deleteSupplier(id);
    if (deleteError) {
      setError(getErrorMessage(deleteError));
      return;
    }
    fetchSuppliers();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Manage your suppliers"
        action={
          <Button onClick={() => { setEditingId(null); reset(); setShowModal(true); }}>
            <Plus size={20} />
            Add Supplier
          </Button>
        }
      />

      {error && <Alert message={error} />}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <DataTable
          columns={[
            { key: 'name', header: 'Name' },
            { key: 'phone', header: 'Phone' },
            { key: 'email', header: 'Email' },
            { key: 'address', header: 'Address' },
            { key: 'created', header: 'Created At' },
            { key: 'actions', header: 'Actions', className: 'text-right' },
          ]}
          isEmpty={suppliers.length === 0}
          emptyMessage="No suppliers found"
        >
          {suppliers.map((supplier) => (
            <tr key={supplier.id} className="hover:bg-dashboard-hover">
              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-dashboard-text-primary">
                {supplier.name}
              </td>
              <td className="px-6 py-4 text-sm text-dashboard-text-sub">{supplier.phone || '-'}</td>
              <td className="px-6 py-4 text-sm text-dashboard-text-sub">{supplier.email || '-'}</td>
              <td className="px-6 py-4 text-sm text-dashboard-text-sub">{supplier.address || '-'}</td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-dashboard-text-sub">{formatDate(supplier.created_at)}</td>
              <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                <button type="button" onClick={() => handleEdit(supplier)} className="mr-3 text-white/80 hover:text-white">
                  <Edit2 size={18} />
                </button>
                <button type="button" onClick={() => handleDelete(supplier.id)} className="text-red-400 hover:text-red-300">
                  <Trash2 size={18} />
                </button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {showModal && (
        <Modal title={editingId ? 'Edit Supplier' : 'Add Supplier'} onClose={closeModal}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input id="name" label="Name" error={errors.name?.message} {...register('name', { required: 'Name is required' })} />
            <Input id="phone" label="Phone" {...register('phone')} />
            <Input id="email" label="Email" type="email" {...register('email')} />
            <Textarea id="address" label="Address" rows={3} {...register('address')} />
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="secondary" className="flex-1" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
