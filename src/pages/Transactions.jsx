import React, { useState, useMemo } from 'react'
import { useApp } from '../App'
import { deleteTransaction } from '../lib/supabase'
import AddTransactionModal from '../components/AddTransactionModal'
import { TxRow } from './Dashboard'

export default function Transactions() {
  const { transactions, categories, profile, refresh } = useApp()
  const [showAddModal, setShowAddModal] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterUser, setFilterUser] = useState('all')

  const filtered = useMemo(() => {
    return transactions
      .filter(t => !search || t.description.toLowerCase().includes(search.toLowerCase()))
      .filter(t => !filterCat || t.category_id === filterCat)
      .filter(t => !filterType || t.type === filterType)
      .filter(t => filterUser === 'all' || t.user_id === filterUser)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [transactions, search, filterCat, filterType, filterUser])

  const uniqueUsers = useMemo(() => {
    const map = new Map()
    transactions.forEach(t => {
      if (t.user_id && t.profiles?.name) map.set(t.user_id, t.profiles.name)
    })
    return Array.from(map.entries())
  }, [transactions])

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar?')) return
    await deleteTransaction(id)
    refresh()
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div><h2>Movimientos</h2><p>Historial completo de ingresos y gastos del hogar</p></div>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <i className="fa fa-plus" /> Añadir
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
          <input
            className="form-control" type="text" placeholder="Buscar…"
            style={{ maxWidth: 190 }} value={search} onChange={e => setSearch(e.target.value)}
          />
          <select className="form-control" style={{ maxWidth: 180 }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <select className="form-control" style={{ maxWidth: 160 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">Todos los tipos</option>
            <option value="expense">Gasto</option>
            <option value="income">Ingreso</option>
            <option value="transfer">Reembolso</option>
            <option value="pot-withdrawal">Retirada bote</option>
          </select>
          {uniqueUsers.length > 1 && (
            <select className="form-control" style={{ maxWidth: 160 }} value={filterUser} onChange={e => setFilterUser(e.target.value)}>
              <option value="all">Todos</option>
              {uniqueUsers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              <option value={profile?.id}>Solo yo</option>
            </select>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-sm text-muted text-center" style={{ padding: 22 }}>No hay movimientos con estos filtros.</div>
        ) : filtered.map(t => (
          <TxRow key={t.id} tx={t} onDelete={() => handleDelete(t.id)} showUser={uniqueUsers.length > 1} />
        ))}
      </div>

      {showAddModal && <AddTransactionModal onClose={() => setShowAddModal(false)} />}
    </div>
  )
}
