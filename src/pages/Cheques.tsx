import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Plus, Search, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Alert, Button, DataTable, Input, LoadingSpinner, Modal, PageHeader } from '../components/ui';
import * as chequeService from '../services/chequeService';
import type { Cheque } from '../types';
import { getErrorMessage } from '../utils/errors';

type DateFilter = 'all' | 'today' | 'upcoming' | 'past';
type ChequeFormInputs = chequeService.ChequeInput;

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatChequeDate(value: string) {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export function Cheques() {
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [editingCheque, setEditingCheque] = useState<Cheque | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Cheque | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ChequeFormInputs>();

  const fetchCheques = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await chequeService.getCheques();
    if (fetchError) setError(getErrorMessage(fetchError));
    else setCheques((data as Cheque[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchCheques(); }, [fetchCheques]);

  const visibleCheques = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const today = localDateValue();
    return cheques
      .filter((cheque) => {
        const matchesSearch = !query || [cheque.name, cheque.cheque_number, cheque.bank]
          .some((value) => value.toLocaleLowerCase().includes(query));
        const matchesDate = dateFilter === 'all'
          || (dateFilter === 'today' && cheque.cheque_date === today)
          || (dateFilter === 'upcoming' && cheque.cheque_date >= today)
          || (dateFilter === 'past' && cheque.cheque_date < today);
        return matchesSearch && matchesDate;
      })
      .sort((a, b) => {
        const aUpcoming = a.cheque_date >= today;
        const bUpcoming = b.cheque_date >= today;
        if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
        const dateOrder = aUpcoming
          ? a.cheque_date.localeCompare(b.cheque_date)
          : b.cheque_date.localeCompare(a.cheque_date);
        return dateOrder || b.created_at.localeCompare(a.created_at);
      });
  }, [cheques, dateFilter, search]);

  const openCreate = () => {
    setError(null);
    setEditingCheque(null);
    reset({ name: '', cheque_number: '', bank: '', cheque_date: localDateValue() });
    setShowForm(true);
  };

  const openEdit = (cheque: Cheque) => {
    setError(null);
    setEditingCheque(cheque);
    reset({ name: cheque.name, cheque_number: cheque.cheque_number, bank: cheque.bank, cheque_date: cheque.cheque_date });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingCheque(null);
    reset();
  };

  const onSubmit = async (values: ChequeFormInputs) => {
    setError(null);
    const data = {
      name: values.name.trim(),
      cheque_number: values.cheque_number.trim(),
      bank: values.bank.trim(),
      cheque_date: values.cheque_date,
    };
    const result = editingCheque
      ? await chequeService.updateCheque(editingCheque.id, data)
      : await chequeService.createCheque(data);
    if (result.error) {
      setError(getErrorMessage(result.error));
      return;
    }
    closeForm();
    await fetchCheques();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    const { error: deleteError } = await chequeService.deleteCheque(deleteTarget.id);
    setDeleting(false);
    if (deleteError) {
      setError(getErrorMessage(deleteError));
      setDeleteTarget(null);
      return;
    }
    setDeleteTarget(null);
    await fetchCheques();
  };

  const filters: { value: DateFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'today', label: 'Today' },
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'past', label: 'Past' },
  ];

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Cheques"
        description="Store and manage cheque records."
        action={<Button onClick={openCreate}><Plus size={19} />Add Cheque</Button>}
      />

      {error && !showForm && <Alert message={error} />}

      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full min-w-0 sm:max-w-md">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dashboard-text-sub" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, cheque number, or bank..."
            aria-label="Search cheques"
            className="dashboard-input w-full pl-10"
          />
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.04] p-1" aria-label="Filter cheques by date">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setDateFilter(filter.value)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${dateFilter === filter.value ? 'bg-dashboard-accent text-white' : 'text-dashboard-text-sub hover:bg-white/[0.08] hover:text-dashboard-text-primary'}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <DataTable
          fitToWidth
          columns={[
            { key: 'name', header: 'Name', className: 'w-[22%]' },
            { key: 'number', header: 'Cheque Number', className: 'w-[24%]' },
            { key: 'bank', header: 'Bank', className: 'w-[23%]' },
            { key: 'date', header: 'Date', className: 'w-[19%]' },
            { key: 'actions', header: 'Actions', className: 'w-[12%] text-right' },
          ]}
          isEmpty={visibleCheques.length === 0}
          emptyMessage={cheques.length === 0 ? 'No cheques recorded. Use the + Add Cheque button to add the first cheque.' : 'No cheques match your search or filter.'}
          tableClassName="text-xs sm:text-sm"
        >
          {visibleCheques.map((cheque) => (
            <tr key={cheque.id} className="hover:bg-dashboard-hover">
              <td className="truncate px-2 py-3 font-medium text-dashboard-text-primary sm:px-4" title={cheque.name}>{cheque.name}</td>
              <td className="truncate px-2 py-3 font-mono text-dashboard-text-label sm:px-4" title={cheque.cheque_number}>{cheque.cheque_number}</td>
              <td className="truncate px-2 py-3 text-dashboard-text-sub sm:px-4" title={cheque.bank}>{cheque.bank}</td>
              <td className="whitespace-nowrap px-2 py-3 text-dashboard-text-sub sm:px-4">{formatChequeDate(cheque.cheque_date)}</td>
              <td className="whitespace-nowrap px-1 py-3 text-right sm:px-3">
                <button type="button" onClick={() => openEdit(cheque)} className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white" title="Edit cheque" aria-label={`Edit cheque ${cheque.cheque_number}`}><Edit2 size={17} /></button>
                <button type="button" onClick={() => setDeleteTarget(cheque)} className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10 hover:text-red-300" title="Delete cheque" aria-label={`Delete cheque ${cheque.cheque_number}`}><Trash2 size={17} /></button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {showForm && (
        <Modal title={editingCheque ? 'Edit Cheque' : 'Add Cheque'} onClose={closeForm} size="sm">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && <Alert message={error} />}
            <Input id="cheque-name" label="Name *" autoFocus error={errors.name?.message} {...register('name', { required: 'Name is required', validate: (value) => value.trim().length > 0 || 'Name is required' })} />
            <Input id="cheque-number" label="Cheque Number *" inputMode="text" error={errors.cheque_number?.message} {...register('cheque_number', { required: 'Cheque number is required', validate: (value) => value.trim().length > 0 || 'Cheque number is required' })} />
            <Input id="cheque-bank" label="Bank *" error={errors.bank?.message} {...register('bank', { required: 'Bank is required', validate: (value) => value.trim().length > 0 || 'Bank is required' })} />
            <Input id="cheque-date" type="date" label="Date *" error={errors.cheque_date?.message} {...register('cheque_date', { required: 'Date is required' })} />
            <div className="flex gap-3 pt-3">
              <Button type="button" variant="secondary" className="flex-1" onClick={closeForm}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">{isSubmitting ? 'Saving...' : 'Save Cheque'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Delete Cheque?" onClose={() => setDeleteTarget(null)} size="sm">
          <p className="text-sm text-dashboard-text-label">Are you sure you want to delete cheque <span className="font-semibold text-dashboard-text-primary">{deleteTarget.cheque_number}</span>?</p>
          <div className="mt-6 flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button type="button" variant="danger" className="flex-1" disabled={deleting} onClick={() => void confirmDelete()}>{deleting ? 'Deleting...' : 'Delete'}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
