import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { Brand } from '../types';
import * as brandService from '../services/brandService';
import { getErrorMessage } from '../utils/errors';
import { formatDate } from '../utils/format';
import { Alert, Button, DataTable, Input, LoadingSpinner, Modal, PageHeader } from '../components/ui';

interface BrandFormInputs {
  name: string;
}

export function Brands() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<BrandFormInputs>();

  const fetchBrands = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await brandService.getBrands();
    if (fetchError) {
      setError(getErrorMessage(fetchError));
    } else {
      setBrands((data as Brand[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    reset();
  };

  const onSubmit = async (data: BrandFormInputs) => {
    setError(null);
    const result = editingId
      ? await brandService.updateBrand(editingId, data)
      : await brandService.createBrand(data);

    if (result.error) {
      setError(getErrorMessage(result.error));
      return;
    }

    closeModal();
    fetchBrands();
  };

  const handleEdit = (brand: Brand) => {
    setEditingId(brand.id);
    reset({ name: brand.name });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this brand?')) return;
    const { error: deleteError } = await brandService.deleteBrand(id);
    if (deleteError) {
      setError(getErrorMessage(deleteError));
      return;
    }
    fetchBrands();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Brands"
        description="Manage shoe brands"
        action={
          <Button onClick={() => { setEditingId(null); reset(); setShowModal(true); }}>
            <Plus size={20} />
            Add Brand
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
            { key: 'created', header: 'Created At' },
            { key: 'actions', header: 'Actions', className: 'text-right' },
          ]}
          isEmpty={brands.length === 0}
          emptyMessage="No brands found"
        >
          {brands.map((brand) => (
            <tr key={brand.id} className="hover:bg-dashboard-hover">
              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-dashboard-text-primary">
                {brand.name}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-dashboard-text-sub">{formatDate(brand.created_at)}</td>
              <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                <button type="button" onClick={() => handleEdit(brand)} className="mr-3 text-white/80 hover:text-white">
                  <Edit2 size={18} />
                </button>
                <button type="button" onClick={() => handleDelete(brand.id)} className="text-red-400 hover:text-red-300">
                  <Trash2 size={18} />
                </button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {showModal && (
        <Modal title={editingId ? 'Edit Brand' : 'Add Brand'} onClose={closeModal}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              id="name"
              label="Name"
              error={errors.name?.message}
              {...register('name', { required: 'Name is required' })}
            />
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
