import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { Category } from '../types';
import * as categoryService from '../services/categoryService';
import { getErrorMessage } from '../utils/errors';
import { formatDate } from '../utils/format';
import { Alert, Button, DataTable, Input, LoadingSpinner, Modal, PageHeader, Textarea } from '../components/ui';

interface CategoryFormInputs {
  name: string;
  description: string;
}

export function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CategoryFormInputs>();

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await categoryService.getCategories();
    if (fetchError) {
      setError(getErrorMessage(fetchError));
    } else {
      setCategories((data as Category[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    reset();
  };

  const onSubmit = async (data: CategoryFormInputs) => {
    setError(null);
    const payload = { name: data.name, description: data.description || null };
    const result = editingId
      ? await categoryService.updateCategory(editingId, payload)
      : await categoryService.createCategory(payload);

    if (result.error) {
      setError(getErrorMessage(result.error));
      return;
    }

    closeModal();
    fetchCategories();
  };

  const handleEdit = (category: Category) => {
    setEditingId(category.id);
    reset({ name: category.name, description: category.description || '' });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    const { error: deleteError } = await categoryService.deleteCategory(id);
    if (deleteError) {
      setError(getErrorMessage(deleteError));
      return;
    }
    fetchCategories();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        description="Organize products by category"
        action={
          <Button onClick={() => { setEditingId(null); reset(); setShowModal(true); }}>
            <Plus size={20} />
            Add Category
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
            { key: 'description', header: 'Description' },
            { key: 'created', header: 'Created At' },
            { key: 'actions', header: 'Actions', className: 'text-right' },
          ]}
          isEmpty={categories.length === 0}
          emptyMessage="No categories found"
        >
          {categories.map((category) => (
            <tr key={category.id} className="hover:bg-dashboard-hover">
              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-dashboard-text-primary">
                {category.name}
              </td>
              <td className="px-6 py-4 text-sm text-dashboard-text-sub">{category.description || '-'}</td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-dashboard-text-sub">{formatDate(category.created_at)}</td>
              <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                <button type="button" onClick={() => handleEdit(category)} className="mr-3 text-white/80 hover:text-white">
                  <Edit2 size={18} />
                </button>
                <button type="button" onClick={() => handleDelete(category.id)} className="text-red-400 hover:text-red-300">
                  <Trash2 size={18} />
                </button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {showModal && (
        <Modal title={editingId ? 'Edit Category' : 'Add Category'} onClose={closeModal}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              id="name"
              label="Name"
              error={errors.name?.message}
              {...register('name', { required: 'Name is required' })}
            />
            <Textarea id="description" label="Description" rows={3} {...register('description')} />
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
