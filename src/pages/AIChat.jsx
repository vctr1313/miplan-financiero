import React, { useState, useRef, useEffect } from 'react'
import { useApp } from '../App'
import { buildAIContext } from '../lib/finance'

const SUGGESTIONS = [
  '¿Cuándo llego a la entrada de la casa?',
  '¿En qué gasto demasiado?',
  'Analiza mi mes actual',
  'Predicción para los próximos 12 meses',
]

export default function AIChat() {
  const { profile, categories, transactions, fixedExpenses, houseGoal, cycles, partnerSummary } = useApp()
  const [messages, setMessages] = useState([{
    role: 'assistant',
    text: `👋 **Hola**, soy tu consejero financiero personal. Conozco todos tus datos: tu sueldo, categorías, historial de movimientos, botes de ahorro y tu meta de la casa.

Puedes preguntarme cosas como:
• "¿En qué categoría me gasto más?"
• "¿Cuánto tiempo me queda para la entrada de la casa?"
• "¿Cómo puedo ahorrar más sin sacrificar ocio?"
• "Analiza mis gastos de los últimos 3 meses"
• "Haz una predicción de mis finanzas para el próximo año"`
  }])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [apiKey] = useState(() => localStorage.getItem('fp_apikey') || '')
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (text) => {
    const msg = text || input.trim()
    if (!msg) return
    setMessages(m => [...m, { role: 'user', text: msg }])
    setInput('')
    setSending(true)

    const hasPaidKey = apiKey && apiKey.startsWith('sk-ant')

    if (!hasPaidKey) {
      const context = buildAIContext({ profile, categories, transactions, fixedExpenses, houseGoal, cycles, partnerSummary })
      const prompt = `Actúa como mi consejero financiero personal. Tienes acceso a todos mis datos financieros. Analiza el histórico, haz predicciones concretas con números y fechas, y da consejos accionables.\n\n${context}\n\nMi pregunta: ${msg}`
      copyToClipboard(prompt)
      setMessages(m => [...m, {
        role: 'assistant',
        text: `📋 **Prompt copiado al portapapeles.**\n\nAhora:\n1. Abre [claude.ai](https://claude.ai) en una nueva pestaña\n2. Pega el texto (Ctrl+V / Cmd+V) y envía\n3. Trae la respuesta aquí si quieres guardarla\n\n💡 Para respuestas instantáneas aquí mismo, añade tu API key en Ajustes.`
      }])
      setSending(false)
      return
    }

    try {
      const context = buildAIContext({ profile, categories, transactions, fixedExpenses, houseGoal, cycles, partnerSummary })
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          messages: [{ role: 'user', content: `Eres un consejero financiero personal experto. Analiza el histórico, haz predicciones concretas con números y fechas, y da consejos accionables.\n\n${context}\n\nPregunta del usuario: ${msg}` }]
        })
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(`API error ${res.status}: ${errData?.error?.message || res.statusText}`)
      }
      const data = await res.json()
      const reply = data.content?.[0]?.text || 'No pude obtener respuesta.'
      setMessages(m => [...m, { role: 'assistant', text: reply }])
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', text: `⚠️ Error al conectar con la IA: ${e.message}` }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div><h2>🤖 Consejero Financiero IA</h2><p>Conoce tus datos completos y hace predicciones basadas en tu historial</p></div>
          <button className="btn btn-ghost" onClick={() => setMessages([messages[0]])}><i className="fa fa-trash" /> Limpiar</button>
        </div>
      </div>

      {!apiKey?.startsWith('sk-ant') && (
        <div className="alert alert-info mb-3">
          <i className="fa fa-circle-info" />
          <div>📋 <strong>Modo gratuito</strong>: al enviar, se copia el prompt al portapapeles para pegarlo en claude.ai. Añade tu API key en Ajustes para respuestas directas aquí.</div>
        </div>
      )}

      <div className="grid-2" style={{ gap: 16, height: 'calc(100vh - 240px)', minHeight: 450 }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="card" style={{ flex: 1, overflowY: 'auto', marginBottom: 12, padding: 16 }}>
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                <div className="chat-bubble" dangerouslySetInnerHTML={{ __html: formatMessage(m.text) }} />
              </div>
            ))}
            {sending && (
              <div className="chat-msg assistant">
                <div className="chat-bubble" style={{ display: 'flex', gap: 4 }}>
                  <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="flex gap-2 mb-2" style={{ flexWrap: 'wrap' }}>
            {SUGGESTIONS.map(s => (
              <button key={s} className="btn btn-sm btn-ghost" onClick={() => handleSend(s)}>{s}</button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              className="form-control" style={{ flex: 1 }}
              value={input} onChange={e => setInput(e.target.value)}
              placeholder="Pregúntame lo que quieras sobre tus finanzas…"
              onKeyDown={e => e.key === 'Enter' && handleSend()}
            />
            <button className="btn btn-primary" onClick={() => handleSend()} disabled={sending}>
              <i className="fa fa-paper-plane" /> Enviar
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <div className="card">
            <div className="section-header"><h3>📊 Tu contexto financiero</h3></div>
            <ContextPanel profile={profile} categories={categories} transactions={transactions} houseGoal={houseGoal} cycles={cycles} />
          </div>
        </div>
      </div>
    </div>
  )
}

function ContextPanel({ profile, categories, transactions, houseGoal, cycles }) {
  const salary = profile?.salary || 0
  const potCount = categories.filter(c => c.type === 'pot').length
  return (
    <div className="text-xs text-muted" style={{ lineHeight: 1.8 }}>
      <div>💰 <strong>Sueldo:</strong> {salary ? `${salary} €` : 'No configurado'}</div>
      <div>📊 <strong>Movimientos:</strong> {transactions.length} registrados</div>
      <div>🪣 <strong>Botes:</strong> {potCount} activos</div>
      <div>🏠 <strong>Meta casa:</strong> {houseGoal?.target ? `${houseGoal.target} €` : 'Sin configurar'}</div>
      <div>🔄 <strong>Ciclos:</strong> {cycles.length} completados</div>
    </div>
  )
}

function formatMessage(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:#a5b4fc;text-decoration:underline">$1</a>')
}

function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
  } else {
    fallbackCopy(text)
  }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.cssText = 'position:fixed;opacity:0'
  document.body.appendChild(ta)
  ta.select()
  try { document.execCommand('copy') } catch (e) {}
  document.body.removeChild(ta)
}
