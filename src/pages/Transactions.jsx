import React, { useState, useMemo } from 'react'
import { useApp } from '../App'
import AddTransactionModal from '../components/AddTransactionModal'
import ImportStatementModal from '../components/ImportStatementModal'
import EditTransactionModal from '../components/EditTransactionModal'
import TxRow from '../components/TxRow'
import useDeleteMovement from '../lib/useDeleteMovement'
import { splitGroups } from '../lib/split'
import EmptyState from '../components/EmptyState'
import MonthCalendar from '../components/MonthCalendar'
import { toLocalISODate } from '../lib/finance'
import { useMediaQuery } from '../lib/ui'

const PAGE_SIZE = 15

function exportCSV(transactions) {
  const headers = ['Fecha', 'Descripción', 'Categoría', 'Tipo', 'Importe (€)']
  const typeLabels = {
    expense: 'Gasto',
    income: 'Ingreso',
    transfer: 'Reembolso',
    'pot-deposit': 'Depósito bote',
    'pot-withdrawal': 'Retirada bote',
  }
  const rows = [...transactions]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(t => [
      t.date,
      t.description,
      t.categories?.name || '',
      typeLabels[t.type] || t.type,
      t.type === 'expense' || t.type === 'pot-withdrawal' ? -t.amount : t.amount,
    ])
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `movimientos_${toLocalISODate(new Date())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function Transactions() {
  const { transactions, categories, profile, fixedExpenses } = useApp()
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingTx, setEditingTx] = useState(null)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterUser, setFilterUser] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  // Wide screens show the selected movement beside the list.
  const wide = useMediaQuery('(min-width: 1100px)')
  const [showCal, setShowCal] = useState(false)
  // A day picked on the calendar is just a one-day date filter.
  const pickDay = (iso) => { setDateFrom(iso || ''); setDateTo(iso || ''); resetPage() }

  const filtered = useMemo(() => {
    return transactions
      .filter(t => !search || t.description.toLowerCase().includes(search.toLowerCase()))
      .filter(t => !filterCat || t.category_id === filterCat)
      .filter(t => !filterType || t.type === filterType)
      .filter(t => filterUser === 'all' || t.user_id === filterUser)
      .filter(t => !dateFrom || t.date >= dateFrom)
      .filter(t => !dateTo || t.date <= dateTo)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [transactions, search, filterCat, filterType, filterUser, dateFrom, dateTo])

  const resetPage = () => setVisibleCount(PAGE_SIZE)

  const uniqueUsers = useMemo(() => {
    const map = new Map()
    transactions.forEach(t => {
      if (t.user_id && t.profiles?.name) map.set(t.user_id, t.profiles.name)
    })
    return Array.from(map.entries())
  }, [transactions])

  const { reimburseMap, txById } = useMemo(() => {
    const reimburseMap = {}
    const txById = {}
    transactions.forEach(t => {
      txById[t.id] = t
      if (t.type === 'transfer' && t.linked_expense_id) {
        reimburseMap[t.linked_expense_id] = (reimburseMap[t.linked_expense_id] || 0) + t.amount
      }
    })
    return { reimburseMap, txById }
  }, [transactions])

  const splitInfo = useMemo(() => splitGroups(transactions), [transactions])

  const handleDelete = useDeleteMovement()


  const visible = filtered.slice(0, visibleCount)
  const hasMore = filtered.length > visibleCount
  const hasFilters = search || filterCat || filterType || filterUser !== 'all' || dateFrom || dateTo

  const clearFilters = () => {
    setSearch(''); setFilterCat(''); setFilterType('')
    setFilterUser('all'); setDateFrom(''); setDateTo('')
    resetPage()
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div><h2>Movimientos</h2><p>Historial completo de ingresos y gastos del hogar</p></div>
          <div className="flex items-center gap-2">
            <button className={`btn ${showCal ? 'btn-primary' : 'btn-outline'}`} onClick={() => setShowCal(v => !v)} aria-pressed={showCal}>
              <i className="fa fa-calendar-days" /> Calendario
            </button>
            <button className="btn btn-outline" onClick={() => setShowImport(true)} title="Importar extracto del banco (CSV o Excel)">
              <i className="fa fa-file-import" /> Importar
            </button>
            <button className="btn btn-outline" onClick={() => exportCSV(filtered)} title="Exportar a Excel/CSV">
              <i className="fa fa-file-excel" /> Exportar
            </button>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <i className="fa fa-plus" /> Añadir
            </button>
          </div>
        </div>
      </div>

      <div className={wide ? 'tx-split' : undefined}>
      <div>
      {showCal && (
        <div className="card mb-4">
          <MonthCalendar transactions={transactions} fixedExpenses={fixedExpenses}
            selected={dateFrom && dateFrom === dateTo ? dateFrom : null} onPickDay={pickDay} />
        </div>
      )}
      <div className="card">
        <div className="flex items-center gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
          <input
            className="form-control" type="text" placeholder="Buscar…"
            style={{ maxWidth: 170 }} value={search}
            onChange={e => { setSearch(e.target.value); resetPage() }}
          />
          <select className="form-control" style={{ maxWidth: 170 }} value={filterCat}
            onChange={e => { setFilterCat(e.target.value); resetPage() }}>
            <option value="">Todas las categorías</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <select className="form-control" style={{ maxWidth: 150 }} value={filterType}
            onChange={e => { setFilterType(e.target.value); resetPage() }}>
            <option value="">Todos los tipos</option>
            <option value="expense">Gasto</option>
            <option value="income">Ingreso</option>
            <option value="transfer">Reembolso</option>
            <option value="pot-withdrawal">Retirada bote</option>
          </select>
          {uniqueUsers.length > 1 && (
            <select className="form-control" style={{ maxWidth: 150 }} value={filterUser}
              onChange={e => { setFilterUser(e.target.value); resetPage() }}>
              <option value="all">Todos</option>
              {uniqueUsers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              <option value={profile?.id}>Solo yo</option>
            </select>
          )}
          <input className="form-control" type="date" title="Desde" style={{ maxWidth: 145 }}
            value={dateFrom} onChange={e => { setDateFrom(e.target.value); resetPage() }} />
          <input className="form-control" type="date" title="Hasta" style={{ maxWidth: 145 }}
            value={dateTo} onChange={e => { setDateTo(e.target.value); resetPage() }} />
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              <i className="fa fa-xmark" /> Limpiar
            </button>
          )}
        </div>

        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8 }}>
          {filtered.length === 0
            ? 'Sin resultados'
            : `${filtered.length} movimiento${filtered.length !== 1 ? 's' : ''}${hasFilters ? ' con estos filtros' : ''}`}
        </div>

        {filtered.length === 0 ? (
          (hasFilters
            ? <EmptyState art="search" title="Nada con estos filtros" text="Prueba a quitar alguno o ampliar las fechas." action={<button className="btn btn-sm btn-ghost" onClick={clearFilters}><i className="fa fa-xmark" /> Limpiar filtros</button>} />
            : <EmptyState art="receipt" title="Aún no hay movimientos" text="Todo lo que añadas aparecerá aquí." />)
        ) : (
          <>
            {visible.map(t => (
              <TxRow
                key={t.id} tx={t}
                onDelete={() => handleDelete(t.id)}
                onEdit={() => setEditingTx(t)}
                onSelect={wide ? () => setEditingTx(t) : undefined}
                selected={wide && editingTx?.id === t.id}
                showUser={uniqueUsers.length > 1}
                reimburseMap={reimburseMap}
                txById={txById}
                splitInfo={splitInfo}
              />
            ))}
            {hasMore && (
              <div style={{ textAlign: 'center', paddingTop: 12 }}>
                <button className="btn btn-outline btn-sm" onClick={() => setVisibleCount(v => v + PAGE_SIZE)}>
                  <i className="fa fa-chevron-down" /> Ver más ({filtered.length - visibleCount} restantes)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      </div>
      {wide && (
        editingTx && transactions.some(t => t.id === editingTx.id)
          ? <EditTransactionModal inline key={editingTx.id} tx={editingTx} onClose={() => setEditingTx(null)} />
          : (
            <div className="card tx-detail-panel tx-detail-empty">
              <i className="fa fa-hand-pointer" />
              Selecciona un movimiento para ver y editar su detalle aquí.
            </div>
          )
      )}
      </div>

      {showAddModal && <AddTransactionModal onClose={() => setShowAddModal(false)} />}
      {showImport && <ImportStatementModal onClose={() => setShowImport(false)} />}
      {editingTx && !wide && <EditTransactionModal tx={editingTx} onClose={() => setEditingTx(null)} />}
    </div>
  )
}
