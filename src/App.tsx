import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, CalendarDays, Check, ChevronRight, CircleAlert, CircleDollarSign, Database, Download, FileText, HandCoins, Landmark, LayoutDashboard, LoaderCircle, Menu, Plus, Search, Upload, Users, Wallet, X } from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import './styles.css'

type Customer = { id: string | number; name: string; mobileNumber: string; address: string; createdAt?: string; status?: string; [key: string]: unknown }
type Loan = { id: string | number; customerId?: string | number; loanType?: string; principalAmount?: number; interestRate?: number; repaymentFrequency?: string; weeklyDay?: string; startDate?: string; installmentAmount?: number; [key: string]: unknown }
type CashFlow = { investmentAmount: number; financialBalance: number; profitAmount: number; collectionAmount: number }
type Transfer = { id: number; source: Account; amount: number; date: string }
type FinancialTransaction = { id: number; transactionType: string; amount: number; transactionDate: string; loanId: string | null; customerName: string | null }
type Page = 'Overview' | 'Customers' | 'Cash Flow' | 'Loans' | 'Collections' | 'Pending Payments' | 'Data Backup'
type Account = 'INVESTMENT' | 'FINANCIAL_BALANCE' | 'PROFIT' | 'COLLECTION'
type TxType = 'COLLECTED' | 'PROFIT'
const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080').replace(/\/$/, '')
const CURRENCY = import.meta.env.VITE_CURRENCY || 'USD'
const pages: { name: Page; icon: typeof LayoutDashboard }[] = [
  { name: 'Overview', icon: LayoutDashboard }, { name: 'Customers', icon: Users }, { name: 'Cash Flow', icon: ArrowLeftRight },
  { name: 'Loans', icon: Banknote }, { name: 'Collections', icon: HandCoins }, { name: 'Pending Payments', icon: CalendarDays },
  { name: 'Data Backup', icon: Database },
]
const money = (value: unknown) => {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '-'
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY }).format(amount) }
  catch { return `${CURRENCY} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
}
const dateLabel = (value: unknown) => {
  if (typeof value !== 'string' || !value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}
const asList = <T,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : value && typeof value === 'object' && Array.isArray((value as { content?: unknown }).content) ? (value as { content: T[] }).content : []
const text = (value: unknown) => value === null || value === undefined || value === '' ? '-' : typeof value === 'object' ? JSON.stringify(value) : String(value)
const today = () => { const date = new Date(); const month = String(date.getMonth() + 1).padStart(2, '0'); const day = String(date.getDate()).padStart(2, '0'); return date.getFullYear() + '-' + month + '-' + day }
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try { response = await fetch(`${API}${path}`, { ...options, headers: { Accept: 'application/json', ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...options.headers } }) }
  catch (e) { throw new Error(`Could not reach the API at ${API}. Check that the server is running and the URL is correct. ${e instanceof Error ? e.message : ''}`) }
  const raw = await response.text()
  let body: unknown
  try { body = raw ? JSON.parse(raw) : undefined } catch { body = raw }
  if (!response.ok) {
    const obj = body && typeof body === 'object' ? body as { message?: string; error?: string; detail?: string } : undefined
    throw new Error(obj?.message || obj?.error || obj?.detail || (typeof body === 'string' && body) || `Request failed (${response.status} ${response.statusText})`)
  }
  return body as T
}
function exportPdf(title: string, columns: string[], rows: (string | number)[][]) {
  const pdf = new jsPDF()
  pdf.setFontSize(18); pdf.text(title, 14, 18)
  pdf.setFontSize(9); pdf.setTextColor(110); pdf.text(`Exported ${new Date().toLocaleString()}`, 14, 25)
  autoTable(pdf, { head: [columns], body: rows, startY: 31, styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [37, 74, 68] } })
  pdf.save(`${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`)
}
const nameFor = (customers: Customer[], id: unknown) => customers.find((c) => String(c.id) === String(id))?.name || `Customer #${text(id)}`
const findKey = (row: Record<string, unknown>, options: string[]) => options.find((candidate) => row[candidate] !== undefined && row[candidate] !== null)
const Field = ({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) => <label className="field"><span>{label}{required && <b aria-hidden="true"> *</b>}</span>{children}</label>
const Header = ({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) => <div className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>
const PdfButton = ({ onClick, label = 'Export PDF' }: { onClick: () => void; label?: string }) => <button className="button button-outline" onClick={onClick} type="button"><Download size={16} />{label}</button>

function App() {
  const [page, setPage] = useState<Page>('Overview'), [mobileNav, setMobileNav] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([]), [loans, setLoans] = useState<Loan[]>([]), [pending, setPending] = useState<Record<string, unknown>[]>([]), [cash, setCash] = useState<CashFlow | null>(null)
  const [transfers, setTransfers] = useState<Transfer[]>([]), [transactions, setTransactions] = useState<FinancialTransaction[]>([])
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [search, setSearch] = useState('')
  const [transferAccountFilter, setTransferAccountFilter] = useState(''), [pendingCustomerFilter, setPendingCustomerFilter] = useState(''), [pendingLoanFilter, setPendingLoanFilter] = useState(''), [pendingDueDateFilter, setPendingDueDateFilter] = useState('')
  const [transactionCustomerFilter, setTransactionCustomerFilter] = useState(''), [transactionLoanFilter, setTransactionLoanFilter] = useState(''), [transactionDateFilter, setTransactionDateFilter] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null), [selectedLoan, setSelectedLoan] = useState<Loan | null>(null)
  const [confirmation, setConfirmation] = useState<{ title: string; message: string; confirmLabel: string; action: () => void } | null>(null)
  const [customerEditor, setCustomerEditor] = useState<Customer | null | false>(false)
  const [backupFile, setBackupFile] = useState<File | null>(null), [backupBusy, setBackupBusy] = useState(false)
  const [customerForm, setCustomerForm] = useState({ name: '', mobileNumber: '', address: '', status: 'Active' })
  const [loanForm, setLoanForm] = useState({ customerId: '', loanType: 'INSTALLMENT_BASED', principalAmount: '', interestRate: '', repaymentFrequency: 'MONTHLY', weeklyDay: 'MONDAY', startDate: today(), installmentAmount: '' })
  const [transferForm, setTransferForm] = useState({ fromAccount: 'INVESTMENT' as Account, amount: '', date: today() })
  const [collectionForm, setCollectionForm] = useState({ customerId: '', loanId: '', collectionDate: today(), amount: '', transactionType: '' as TxType | '' })
  const [customerLoans, setCustomerLoans] = useState<Loan[]>([]), [loansLoading, setLoansLoading] = useState(false)

  const loadCustomers = useCallback(async (term = '') => setCustomers(asList<Customer>(await request<unknown>(`/api/customers${term.trim() ? `?search=${encodeURIComponent(term.trim())}` : ''}`))), [])
  const loadLoans = useCallback(async () => setLoans(asList<Loan>(await request<unknown>('/api/loans'))), [])
  const loadCash = useCallback(async () => setCash(await request<CashFlow>('/api/cash-flow')), [])
  const loadPending = useCallback(async () => setPending(asList<Record<string, unknown>>(await request<unknown>('/api/payments/pending'))), [])
  const loadTransfers = useCallback(async () => setTransfers(asList<Transfer>(await request<unknown>('/api/cash-flow/transfers'))), [])
  const loadTransactions = useCallback(async () => setTransactions(asList<FinancialTransaction>(await request<unknown>('/api/collections/history'))), [])
  const refreshAll = useCallback(async (): Promise<boolean> => {
    setLoading(true); setError('')
    try { await Promise.all([loadCustomers(), loadLoans(), loadCash(), loadPending(), loadTransfers(), loadTransactions()]); return true }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load dashboard data.'); return false }
    finally { setLoading(false) }
  }, [loadCash, loadCustomers, loadLoans, loadPending, loadTransfers, loadTransactions])
  useEffect(() => { void refreshAll() }, [refreshAll])
  useEffect(() => {
    if (page !== 'Customers') return
    const timer = window.setTimeout(() => { loadCustomers(search).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not search customers.')) }, 250)
    return () => window.clearTimeout(timer)
  }, [search, page, loadCustomers])
  useEffect(() => {
    if (!collectionForm.customerId) { setCustomerLoans([]); return }
    let active = true
    setLoansLoading(true); setError('')
    request<unknown>(`/api/loans?customerId=${encodeURIComponent(collectionForm.customerId)}`)
      .then((data) => { if (active) { const list = asList<Loan>(data); setCustomerLoans(list); setCollectionForm((form) => ({ ...form, loanId: list.some((loan) => String(loan.id) === form.loanId) ? form.loanId : '' })) } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Could not load this customer's loans.") })
      .finally(() => { if (active) setLoansLoading(false) })
    return () => { active = false }
  }, [collectionForm.customerId])
  useEffect(() => { if (notice) { const timer = window.setTimeout(() => setNotice(''), 3500); return () => window.clearTimeout(timer) } }, [notice])

  const totalLoans = useMemo(() => loans.reduce((sum, loan) => sum + (Number(loan.principalAmount) || 0), 0), [loans])
  const filteredTransactions = useMemo(() => transactions.filter((transaction) =>
    (!transactionCustomerFilter || transaction.customerName === transactionCustomerFilter) &&
    (!transactionLoanFilter || transaction.loanId?.toLowerCase().includes(transactionLoanFilter.toLowerCase())) &&
    (!transactionDateFilter || String(transaction.transactionDate).slice(0, 10) === transactionDateFilter)
  ), [transactions, transactionCustomerFilter, transactionLoanFilter, transactionDateFilter])
  const filteredPending = useMemo(() => pending.filter((row) => {
    const customerMatches = !pendingCustomerFilter || String(row.customerId) === pendingCustomerFilter
    const loanId = String(row.loanId ?? row.id ?? '')
    const loanMatches = !pendingLoanFilter || loanId.toLowerCase().includes(pendingLoanFilter.toLowerCase())
    const dueDate = findKey(row, ['nextInstallmentDate', 'dueDate', 'paymentDate', 'date'])
    const dateMatches = !pendingDueDateFilter || (dueDate !== undefined && String(row[dueDate]).slice(0, 10) === pendingDueDateFilter)
    return customerMatches && loanMatches && dateMatches
  }), [pending, pendingCustomerFilter, pendingLoanFilter, pendingDueDateFilter])
  const transactionTotal = filteredTransactions.reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0)
  const pendingTotal = filteredPending.reduce((sum, row) => sum + (Number(row.amount ?? row.installmentAmount) || 0), 0)
  const go = (next: Page) => { setPage(next); setMobileNav(false); setError(''); setSelectedCustomer(null); setSelectedLoan(null) }
  const mutate = async (action: () => Promise<unknown>, success: string, reload: () => Promise<unknown>): Promise<boolean> => {
    setError(''); setNotice('')
    try { await action(); await reload(); setNotice(success); return true }
    catch (e) { setError(e instanceof Error ? e.message : 'The request could not be completed.'); return false }
  }
  const confirmAction = (title: string, message: string, confirmLabel: string, action: () => void) => {
    setConfirmation({ title, message, confirmLabel, action })
  }
  const openCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer); setError('')
    try { setSelectedCustomer(await request<Customer>(`/api/customers/${encodeURIComponent(customer.id)}`)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load customer details.') }
  }
  const openLoan = async (loan: Loan) => {
    setSelectedLoan(loan); setError('')
    try { setSelectedLoan(await request<Loan>(`/api/loans/${encodeURIComponent(loan.id)}`)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load loan details.') }
  }
  const startCustomer = (customer?: Customer) => {
    setCustomerEditor(customer || null); setCustomerForm({ name: customer?.name || '', mobileNumber: customer?.mobileNumber || '', address: customer?.address || '', status: customer?.status || 'Active' }); setError('')
  }
  const saveCustomer = (event: FormEvent) => {
    event.preventDefault()
    if (!customerForm.name.trim()) { setError('Name is required.'); return }
    const editing = customerEditor || null
    const action = () => { void mutate(() => request(editing ? `/api/customers/${encodeURIComponent(editing.id)}` : '/api/customers', { method: editing ? 'PUT' : 'POST', body: JSON.stringify({ name: customerForm.name.trim(), mobileNumber: customerForm.mobileNumber.trim() || '', address: customerForm.address.trim() || '', status: customerForm.status }) }), editing ? 'Customer updated.' : 'Customer added.', () => loadCustomers(search)).then((saved) => { if (saved) setCustomerEditor(false) }) }
    if (editing) action()
    else confirmAction('Confirm customer creation', 'Once confirmed, this customer record cannot be automatically reverted.', 'Create customer', action)
  }
  const saveLoan = (event: FormEvent) => {
    event.preventDefault()
    const principalAmount = Number(loanForm.principalAmount), interestRate = Number(loanForm.interestRate || 0)
    const installmentAmount = loanForm.loanType === 'MONTHLY_INTEREST'
      ? Number((principalAmount * interestRate / 100).toFixed(2))
      : Number(loanForm.installmentAmount)
    if (!loanForm.customerId || !loanForm.startDate || principalAmount <= 0 || installmentAmount <= 0 || interestRate < 0 || (loanForm.loanType === 'MONTHLY_INTEREST' && interestRate <= 0) || !Number.isFinite(principalAmount + installmentAmount + interestRate)) { setError('Choose a customer and enter a valid start date, principal, installment, and positive monthly interest rate.'); return }
    const repaymentFrequency = loanForm.loanType === 'MONTHLY_INTEREST' ? 'MONTHLY' : loanForm.repaymentFrequency
    const payload = { customerId: loanForm.customerId, loanType: loanForm.loanType, principalAmount, interestRate, repaymentFrequency, ...(repaymentFrequency === 'WEEKLY' ? { weeklyDay: loanForm.weeklyDay } : {}), startDate: loanForm.startDate, installmentAmount }
    confirmAction('Confirm loan creation', 'Once confirmed, this loan and its financial transactions cannot be automatically reverted.', 'Create loan', () => {
      void mutate(() => request('/api/loans', { method: 'POST', body: JSON.stringify(payload) }), 'Loan created.', async () => { await Promise.all([loadLoans(), loadCustomers(), loadCash(), loadPending(), loadTransactions()]) })
        .then((saved) => { if (saved) setLoanForm((form) => ({ ...form, principalAmount: '', interestRate: '', installmentAmount: '' })) })
    })
  }
  const saveTransfer = (event: FormEvent) => {
    event.preventDefault(); const amount = Number(transferForm.amount)
    if (!Number.isFinite(amount) || amount <= 0 || !transferForm.date) { setError('Enter a valid transfer amount greater than zero and a date.'); return }
    const payload = { ...transferForm, amount }
    confirmAction('Confirm cash flow transfer', 'Once confirmed, this transfer and the associated balance changes cannot be automatically reverted.', 'Record transfer', () => {
      void mutate(() => request('/api/cash-flow/transfers', { method: 'POST', body: JSON.stringify(payload) }), 'Transfer recorded.', async () => { await Promise.all([loadCash(), loadPending(), loadTransfers()]) })
        .then((saved) => { if (saved) setTransferForm((form) => ({ ...form, amount: '' })) })
    })
  }
  const saveCollection = (event: FormEvent) => {
    event.preventDefault(); const amount = Number(collectionForm.amount)
    if (!collectionForm.customerId || !collectionForm.loanId || !collectionForm.transactionType || !collectionForm.collectionDate || !Number.isFinite(amount) || amount <= 0) { setError('Select a customer and loan, then enter a valid date and amount greater than zero.'); return }
    const payload = { loanId: collectionForm.loanId, collectionDate: collectionForm.collectionDate, amount, transactionType: collectionForm.transactionType }
    confirmAction('Confirm collection', 'Once confirmed, this collection and its balance or payment schedule changes cannot be automatically reverted.', 'Record collection', () => {
      void mutate(() => request('/api/collections', { method: 'POST', body: JSON.stringify(payload) }), 'Collection recorded.', async () => { await Promise.all([loadCash(), loadPending(), loadTransactions()]) })
        .then((saved) => { if (saved) setCollectionForm((form) => ({ ...form, amount: '' })) })
    })
  }
  const transferSourceBalance = cash ? ({ INVESTMENT: cash.investmentAmount, FINANCIAL_BALANCE: cash.financialBalance, PROFIT: cash.profitAmount, COLLECTION: cash.collectionAmount })[transferForm.fromAccount] : null
  const collectionLoan = customerLoans.find((loan) => String(loan.id) === collectionForm.loanId)
  const tenure = Number(loanForm.principalAmount) > 0 && Number(loanForm.installmentAmount) > 0 ? Math.ceil(Number(loanForm.principalAmount) / Number(loanForm.installmentAmount)) : null
  const downloadCustomers = () => exportPdf('Customers', ['ID', 'Name', 'Mobile', 'Address', 'Status'], customers.map((c) => [c.id, c.name, c.mobileNumber, c.address, text(c.status)]))
  const downloadLoans = () => exportPdf('Loans', ['ID', 'Customer', 'Type', 'Principal', 'Rate', 'Frequency', 'Installment'], loans.map((l) => [l.id, nameFor(customers, l.customerId), text(l.loanType), money(l.principalAmount), text(l.interestRate), text(l.repaymentFrequency), money(l.installmentAmount)]))
  const downloadPending = () => { const keys = [...new Set(pending.flatMap((row) => Object.keys(row)))].filter((key) => !key.startsWith('_')); exportPdf('Pending Payments', keys, pending.map((row) => keys.map((key) => text(row[key])))) }
  const downloadCash = () => exportPdf('Cash Flow', ['Account', 'Balance'], cash ? [['Investment', money(cash.investmentAmount)], ['Financial balance', money(cash.financialBalance)], ['Profit', money(cash.profitAmount)], ['Collections', money(cash.collectionAmount)]] : [])
  const downloadDatabaseBackup = async () => {
    setBackupBusy(true); setError('')
    try {
      const response = await fetch(`${API}/api/backup`, { headers: { Accept: 'application/sql' } })
      if (!response.ok) throw new Error(`Backup download failed (${response.status} ${response.statusText}).`)
      const blob = await response.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1] || 'finance-backup.sql'
      link.click()
      URL.revokeObjectURL(link.href)
      setNotice('Database backup downloaded.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not download database backup.') }
    finally { setBackupBusy(false) }
  }
  const importDatabaseBackup = () => {
    if (!backupFile) { setError('Choose a SQL backup file first.'); return }
    const file = backupFile
    confirmAction('Replace database from backup?', 'This replaces all current customers, loans, cash balances, and transaction history with the selected backup. This cannot be undone. Create a backup of the current data first if you may need it.', 'Replace all data', () => {
      void (async () => {
        setBackupBusy(true); setError(''); setNotice('')
        try {
          const form = new FormData()
          form.append('file', file)
          await request('/api/backup/import', { method: 'POST', body: form })
          const refreshed = await refreshAll()
          setBackupFile(null)
          if (refreshed) setNotice('Database restored from backup. ID sequences are ready for new records.')
          else setError('Backup restored, but some data could not be refreshed in the screen. Reload the application.')
        } catch (e) { setError(e instanceof Error ? e.message : 'Could not import database backup.') }
        finally { setBackupBusy(false) }
      })()
    })
  }
  const metric = (label: string, amount: unknown, icon: ReactNode, tone: string, caption: string) => <article className="metric-card" key={label}><div className={`metric-icon ${tone}`}>{icon}</div><span className="metric-label">{label}</span><strong>{money(amount)}</strong><span className="metric-caption">{caption}</span></article>
  const renderDetails = (record: Record<string, unknown>, omit: string[]) => <dl className="detail-grid">{Object.entries(record).filter(([key]) => !omit.includes(key)).map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</dt><dd>{text(value)}</dd></div>)}</dl>

  let content: ReactNode
  if (page === 'Overview') content = <>
    <Header title="Good morning" subtitle="Here's a clear view of your finance operations." action={<PdfButton onClick={downloadCash} label="Export balances" />} />
    {cash ? <div className="metric-grid">{metric('Investment', cash.investmentAmount, <Landmark size={20} />, 'mint', 'Capital available')}{metric('Financial balance', cash.financialBalance, <Wallet size={20} />, 'blue', 'Operating balance')}{metric('Profit', cash.profitAmount, <ArrowUpRight size={20} />, 'gold', 'Profit balance')}{metric('Collections', cash.collectionAmount, <ArrowDownLeft size={20} />, 'purple', 'Collected to date')}</div> : <LoadingOrEmpty loading={loading} text="Cash flow balances are not available." />}
    <div className="overview-grid"><section className="panel"><div className="panel-heading"><div><h2>Portfolio snapshot</h2><p>Live records from your API</p></div><button className="text-link" onClick={() => go('Loans')}>View loans <ChevronRight size={15} /></button></div><div className="snapshot"><div><span>Customers</span><strong>{customers.length}</strong></div><div><span>Active loans</span><strong>{loans.length}</strong></div><div><span>Principal issued</span><strong>{money(totalLoans)}</strong></div><div><span>Payments pending</span><strong>{pending.length}</strong></div></div></section>
      <section className="panel quick-panel"><div className="panel-heading"><div><h2>Quick actions</h2><p>Keep your books up to date</p></div></div><button onClick={() => { go('Customers'); startCustomer() }}><span className="quick-icon mint"><Users size={17} /></span><span><b>Add customer</b><small>Create a customer profile</small></span><ChevronRight size={17} /></button><button onClick={() => go('Loans')}><span className="quick-icon blue"><CircleDollarSign size={17} /></span><span><b>Create a loan</b><small>Set terms and repayment</small></span><ChevronRight size={17} /></button><button onClick={() => go('Collections')}><span className="quick-icon gold"><HandCoins size={17} /></span><span><b>Record collection</b><small>Log a payment or profit</small></span><ChevronRight size={17} /></button></section></div>
    <section className="panel"><div className="panel-heading"><div><h2>Upcoming payments</h2><p>Payments requiring attention</p></div><button className="text-link" onClick={() => go('Pending Payments')}>See all <ChevronRight size={15} /></button></div><PendingTable data={pending.slice(0, 5)} customers={customers} onExport={downloadPending} /></section>
  </>
  else if (page === 'Customers') content = selectedCustomer ? <>
    <Header title="Customer profile" subtitle="Customer information and account details." action={<button className="button button-outline" onClick={() => setSelectedCustomer(null)}><ChevronRight className="back-chevron" size={16} />Back to customers</button>} />
    <section className="panel detail-panel"><div className="profile-header"><div className="avatar large">{selectedCustomer.name?.slice(0, 1).toUpperCase() || '?'}</div><div><h2>{selectedCustomer.name}</h2><span>{selectedCustomer.mobileNumber}</span></div><button className="button button-outline push-right" onClick={() => startCustomer(selectedCustomer)}>Edit customer</button></div>{renderDetails(selectedCustomer as Record<string, unknown>, ['id', 'name', 'mobileNumber', 'address'])}<div className="address-block"><span>Address</span><p>{selectedCustomer.address || 'No address provided'}</p></div></section>
  </> : <>
    <Header title="Customers" subtitle="Manage your customer records and contact information." action={<button className="button button-primary" onClick={() => startCustomer()}><Plus size={17} />Add customer</button>} />
    <section className="panel"><div className="table-toolbar"><label className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or mobile..." aria-label="Search customers" /></label><PdfButton onClick={downloadCustomers} /></div>
      <DataState loading={loading} error={error} empty={customers.length === 0} emptyText={search ? 'Try another name or mobile number.' : 'Add your first customer to get started.'}><div className="table-wrap"><table><thead><tr><th>Customer</th><th>Mobile number</th><th>Address</th><th>Status</th><th>Added</th><th /></tr></thead><tbody>{customers.map((c) => <tr key={c.id} onClick={() => void openCustomer(c)} className="click-row"><td><div className="customer-cell"><span className="avatar">{c.name?.slice(0, 1).toUpperCase() || '?'}</span><b>{c.name}</b></div></td><td>{c.mobileNumber}</td><td className="truncate">{c.address}</td><td><span className={`status-pill ${String(c.status || '').toLowerCase() === 'active' ? 'status-green' : ''}`}>{text(c.status)}</span></td><td>{dateLabel(c.createdAt)}</td><td><button className="icon-button" aria-label={`Edit ${c.name}`} onClick={(e) => { e.stopPropagation(); startCustomer(c) }}><ChevronRight size={17} /></button></td></tr>)}</tbody></table></div></DataState>
    </section>
  </>
  else if (page === 'Cash Flow') content = <>
    <Header title="Cash flow" subtitle="Balances across your accounts and transfers into Financial Balance." action={cash && <PdfButton onClick={downloadCash} />} />
    {cash ? <div className="metric-grid">{metric('Investment', cash.investmentAmount, <Landmark size={20} />, 'mint', 'Investment account')}{metric('Financial balance', cash.financialBalance, <Wallet size={20} />, 'blue', 'Financial account')}{metric('Profit', cash.profitAmount, <ArrowUpRight size={20} />, 'gold', 'Profit account')}{metric('Collections', cash.collectionAmount, <ArrowDownLeft size={20} />, 'purple', 'Collection account')}</div> : <LoadingOrEmpty loading={loading} text="Cash flow balances are not available." />}
    <section className="panel form-panel"><div className="panel-heading"><div><h2>Transfer funds</h2><p>Transfer funds into Financial Balance from the selected account.</p></div><span className="section-icon"><ArrowLeftRight size={19} /></span></div><form className="form-grid" onSubmit={saveTransfer}>
      <Field label="From account" required><select value={transferForm.fromAccount} onChange={(e) => setTransferForm({ ...transferForm, fromAccount: e.target.value as Account })}><option value="INVESTMENT">Investment</option><option value="FINANCIAL_BALANCE">Financial balance</option><option value="PROFIT">Profit</option><option value="COLLECTION">Collection</option></select></Field>
      {transferForm.fromAccount !== 'INVESTMENT' && <Field label="Available source balance"><input type="text" readOnly value={transferSourceBalance === null ? (loading ? 'Loading balance…' : 'Balances unavailable') : money(transferSourceBalance)} /></Field>}<Field label="Amount" required><input type="number" min="0.01" step="0.01" value={transferForm.amount} onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })} placeholder="0.00" required /></Field>
      <Field label="Transfer date" required><input type="date" value={transferForm.date} onChange={(e) => setTransferForm({ ...transferForm, date: e.target.value })} required /></Field>
      <div className="form-actions"><button className="button button-primary" type="submit"><ArrowLeftRight size={16} />Record transfer</button></div>
    </form></section>
    <section className="panel"><div className="panel-heading"><div><h2>Cash transfer history</h2><p>{transfers.length} transfer{transfers.length === 1 ? '' : 's'}</p></div></div>
      <div className="table-toolbar"><Field label="Filter by from account"><select value={transferAccountFilter} onChange={(e) => setTransferAccountFilter(e.target.value)}><option value="">All accounts</option>{(['INVESTMENT', 'FINANCIAL_BALANCE', 'PROFIT', 'COLLECTION'] as Account[]).map((account) => <option key={account} value={account}>{account.replace(/_/g, ' ')}</option>)}</select></Field></div>
      <div className="table-wrap"><table><thead><tr><th>Date</th><th>From account</th><th>Amount</th></tr></thead><tbody>{transfers.filter((transfer) => !transferAccountFilter || transfer.source === transferAccountFilter).map((transfer) => <tr key={transfer.id}><td>{dateLabel(transfer.date)}</td><td>{transfer.source.replace(/_/g, ' ')}</td><td>{money(transfer.amount)}</td></tr>)}</tbody></table></div>
      {transfers.filter((transfer) => !transferAccountFilter || transfer.source === transferAccountFilter).length === 0 && <p className="empty-state">No transfers match this filter.</p>}
    </section>
  </>
  else if (page === 'Loans') content = selectedLoan ? <>
    <Header title="Loan details" subtitle="Loan terms and repayment information." action={<button className="button button-outline" onClick={() => setSelectedLoan(null)}><ChevronRight className="back-chevron" size={16} />Back to loans</button>} />
    <section className="panel detail-panel"><div className="profile-header"><div className="quick-icon blue"><CircleDollarSign size={22} /></div><div><h2>Loan #{selectedLoan.id}</h2><span>{nameFor(customers, selectedLoan.customerId)}</span></div><span className="status-pill status-green push-right">{text(selectedLoan.loanType)}</span></div>{renderDetails(selectedLoan as Record<string, unknown>, [])}</section>
  </> : <>
    <Header title="Loans" subtitle="Create and review customer loan accounts." action={<PdfButton onClick={downloadLoans} />} />
    <section className="panel form-panel"><div className="panel-heading"><div><h2>Create a loan</h2><p>Enter the customer and the repayment terms.</p></div><span className="section-icon"><Banknote size={19} /></span></div><form className="form-grid" onSubmit={saveLoan}>
      <Field label="Customer" required><select value={loanForm.customerId} onChange={(e) => setLoanForm({ ...loanForm, customerId: e.target.value })} required><option value="">Select a customer</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name} - {c.mobileNumber}</option>)}</select></Field>
      <Field label="Loan type" required><select value={loanForm.loanType} onChange={(e) => setLoanForm({ ...loanForm, loanType: e.target.value, repaymentFrequency: e.target.value === 'MONTHLY_INTEREST' ? 'MONTHLY' : loanForm.repaymentFrequency })}><option value="INSTALLMENT_BASED">Installment-based</option><option value="MONTHLY_INTEREST">Monthly interest</option></select></Field>
      <Field label="Principal amount" required><input type="number" min="0.01" step="0.01" value={loanForm.principalAmount} onChange={(e) => setLoanForm({ ...loanForm, principalAmount: e.target.value })} placeholder="0.00" required /></Field>
      <Field label="Interest rate (%)"><input type="number" min="0" step="0.01" value={loanForm.interestRate} onChange={(e) => setLoanForm({ ...loanForm, interestRate: e.target.value })} placeholder="0" /></Field>
      <Field label="Repayment frequency" required><select value={loanForm.repaymentFrequency} onChange={(e) => setLoanForm({ ...loanForm, repaymentFrequency: e.target.value })} disabled={loanForm.loanType === 'MONTHLY_INTEREST'}>{loanForm.loanType === 'MONTHLY_INTEREST' ? <option value="MONTHLY">Monthly</option> : <><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></>}</select></Field>
      {loanForm.repaymentFrequency === 'WEEKLY' && <Field label="Repayment weekday" required><select value={loanForm.weeklyDay} onChange={(e) => setLoanForm({ ...loanForm, weeklyDay: e.target.value })}>{['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map((day) => <option key={day} value={day}>{day.charAt(0) + day.slice(1).toLowerCase()}</option>)}</select></Field>}
      <Field label="Start date" required><input type="date" value={loanForm.startDate} onChange={(e) => setLoanForm({ ...loanForm, startDate: e.target.value })} required /></Field>
      <Field label={loanForm.loanType === 'MONTHLY_INTEREST' ? 'Monthly interest amount' : 'Installment amount'} required><input type="number" min="0.01" step="0.01" value={loanForm.loanType === 'MONTHLY_INTEREST' ? (Number(loanForm.principalAmount) > 0 && Number(loanForm.interestRate) > 0 ? (Number(loanForm.principalAmount) * Number(loanForm.interestRate) / 100).toFixed(2) : '') : loanForm.installmentAmount} onChange={(e) => setLoanForm({ ...loanForm, installmentAmount: e.target.value })} placeholder="0.00" readOnly={loanForm.loanType === 'MONTHLY_INTEREST'} required /><small>{loanForm.loanType === 'MONTHLY_INTEREST' ? 'Calculated as principal × interest rate ÷ 100.' : ''}</small></Field>
      {tenure !== null && loanForm.loanType === 'INSTALLMENT_BASED' && <div className="tenure-note"><CalendarDays size={17} /><span>Estimated tenure <b>{tenure} installment{tenure === 1 ? '' : 's'}</b> (principal - installment, rounded up)</span></div>}
      <div className="form-actions"><button className="button button-primary" type="submit"><Plus size={16} />Create loan</button></div>
    </form></section>
    <section className="panel"><div className="panel-heading"><div><h2>Loan accounts</h2><p>{loans.length} record{loans.length === 1 ? '' : 's'}</p></div></div><DataState loading={loading} error={error} empty={!loans.length} emptyText="New loan accounts will appear here."><div className="table-wrap"><table><thead><tr><th>Loan</th><th>Customer</th><th>Type</th><th>Principal</th><th>Rate</th><th>Frequency</th><th>Installment</th><th /></tr></thead><tbody>{loans.map((l) => <tr className="click-row" key={l.id} onClick={() => void openLoan(l)}><td>#{l.id}</td><td>{nameFor(customers, l.customerId)}</td><td>{text(l.loanType)}</td><td>{money(l.principalAmount)}</td><td>{l.interestRate == null ? '-' : `${l.interestRate}%`}</td><td>{text(l.repaymentFrequency)}</td><td>{money(l.installmentAmount)}</td><td><ChevronRight size={17} /></td></tr>)}</tbody></table></div></DataState></section>
  </>
  else if (page === 'Collections') content = <>
    <Header title="Collections" subtitle="Record loan repayments and profit transactions." />
    <section className="panel form-panel"><div className="panel-heading"><div><h2>Record a collection</h2><p>Select a customer to see their loans.</p></div><span className="section-icon"><HandCoins size={19} /></span></div><form className="form-grid" onSubmit={saveCollection}>
      <Field label="Customer" required><select value={collectionForm.customerId} onChange={(e) => setCollectionForm({ ...collectionForm, customerId: e.target.value, loanId: '', transactionType: '', amount: '' })} required><option value="">Select a customer</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name} - {c.mobileNumber}</option>)}</select></Field>
      <Field label="Loan" required><select value={collectionForm.loanId} onChange={(e) => { const loan = customerLoans.find((item) => String(item.id) === e.target.value); const transactionType = loan?.loanType === 'MONTHLY_INTEREST' ? 'PROFIT' : loan ? 'COLLECTED' : ''; setCollectionForm({ ...collectionForm, loanId: e.target.value, transactionType, amount: loan ? String(loan.installmentAmount ?? '') : '' }) }} required disabled={!collectionForm.customerId || loansLoading}><option value="">{loansLoading ? 'Loading loans...' : collectionForm.customerId ? 'Select a loan' : 'Choose a customer first'}</option>{customerLoans.map((l) => <option key={l.id} value={l.id}>#{l.id} - {money(l.principalAmount)} - {text(l.loanType)}</option>)}</select></Field>
      <Field label="Transaction type" required><select value={collectionForm.transactionType} onChange={(e) => setCollectionForm({ ...collectionForm, transactionType: e.target.value as TxType | '', amount: e.target.value === 'PROFIT' || collectionLoan?.loanType === 'INSTALLMENT_BASED' ? String(collectionLoan?.installmentAmount ?? '') : '' })} required disabled={!collectionLoan}><option value="">{collectionLoan ? 'Select transaction type' : 'Select a loan first'}</option>{collectionLoan?.loanType === 'MONTHLY_INTEREST' ? <><option value="COLLECTED">Collected</option><option value="PROFIT">Profit</option></> : collectionLoan ? <option value="COLLECTED">Collected</option> : null}</select></Field>
      <Field label="Collection date" required><input type="date" value={collectionForm.collectionDate} onChange={(e) => setCollectionForm({ ...collectionForm, collectionDate: e.target.value })} required /></Field>
      <Field label="Amount" required><input type="number" min="0.01" step="0.01" value={collectionForm.amount} onChange={(e) => setCollectionForm({ ...collectionForm, amount: e.target.value })} placeholder="0.00" required /></Field>
      <div className="form-actions"><button className="button button-primary" type="submit"><Check size={16} />Record collection</button></div>
    </form></section>
    <section className="panel"><div className="panel-heading"><div><h2>Financial transaction history</h2><p>{transactions.length} transaction{transactions.length === 1 ? '' : 's'}</p></div></div>
      <div className="table-toolbar">
        <Field label="Filter by customer"><select value={transactionCustomerFilter} onChange={(e) => setTransactionCustomerFilter(e.target.value)}><option value="">All customers</option>{customers.map((customer) => <option key={customer.id} value={customer.name}>{customer.name}</option>)}</select></Field>
        <Field label="Filter by loan name"><input type="search" value={transactionLoanFilter} onChange={(e) => setTransactionLoanFilter(e.target.value)} placeholder="Search loan ID" /></Field>
        <Field label="Filter by date"><input type="date" value={transactionDateFilter} onChange={(e) => setTransactionDateFilter(e.target.value)} /></Field>
      </div>
      <div className="summary-card"><div><span>Filtered amount total</span><small>{filteredTransactions.length} matching transaction{filteredTransactions.length === 1 ? '' : 's'}</small></div><strong>{money(transactionTotal)}</strong></div>
      <div className="table-wrap"><table><thead><tr><th>Date</th><th>Customer</th><th>Loan name</th><th>Transaction type</th><th>Amount</th></tr></thead><tbody>{filteredTransactions.map((transaction) => <tr key={transaction.id}><td>{dateLabel(transaction.transactionDate)}</td><td>{text(transaction.customerName)}</td><td>{text(transaction.loanId)}</td><td>{text(transaction.transactionType)}</td><td>{money(transaction.amount)}</td></tr>)}</tbody></table></div>
      {filteredTransactions.length === 0 && <p className="empty-state">No transactions match these filters.</p>}
    </section>
  </>
  else if (page === 'Pending Payments') content = <>
    <Header title="Pending payments" subtitle="Due dates and upcoming payment obligations." action={<PdfButton onClick={downloadPending} />} />
    <section className="panel"><div className="table-toolbar">
      <Field label="Filter by customer"><select value={pendingCustomerFilter} onChange={(e) => setPendingCustomerFilter(e.target.value)}><option value="">All customers</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field>
      <Field label="Filter by loan name"><input type="search" value={pendingLoanFilter} onChange={(e) => setPendingLoanFilter(e.target.value)} placeholder="Search loan ID" /></Field>
      <Field label="Filter by due date"><input type="date" value={pendingDueDateFilter} onChange={(e) => setPendingDueDateFilter(e.target.value)} /></Field>
    </div><div className="summary-card"><div><span>Filtered pending amount</span><small>{filteredPending.length} matching payment{filteredPending.length === 1 ? '' : 's'}</small></div><strong>{money(pendingTotal)}</strong></div><DataState loading={loading} error={error} empty={!pending.length} emptyText="There are no pending payments returned by the API."><PendingTable data={filteredPending} customers={customers} onExport={downloadPending} /></DataState></section>
  </>
  else content = <>
    <Header title="Data backup" subtitle="Download an SQL backup or restore this application from a previous backup." />
    <section className="panel form-panel">
      <div className="panel-heading"><div><h2>Export database backup</h2><p>Download all application records in a dated SQL file.</p></div><span className="section-icon"><Database size={19} /></span></div>
      <div className="backup-panel-body"><p>Backup files include customers, loans, account balances, collections, and transfers. The file name uses the current date, for example 19Oct2026.sql.</p><button className="button button-primary" type="button" onClick={() => void downloadDatabaseBackup()} disabled={backupBusy}><Download size={16} />{backupBusy ? 'Working…' : 'Download SQL backup'}</button></div>
    </section>
    <section className="panel form-panel">
      <div className="panel-heading"><div><h2>Import database backup</h2><p>Restore a backup created by this application.</p></div><span className="section-icon"><Upload size={19} /></span></div>
      <div className="backup-panel-body"><div className="alert alert-error"><CircleAlert size={18} /><span>Import replaces all current application data with the selected backup. This cannot be undone. Export a backup first if you may need the current data. Only SQL backup files created by this application can be restored here.</span></div><Field label="SQL backup file" required><input key={backupFile?.name || 'no-file'} type="file" accept=".sql,text/plain" onChange={(event) => setBackupFile(event.target.files?.[0] || null)} /></Field><p className="record-count">{backupFile?.name || 'Select a backup file to continue.'}</p><button className="button button-primary" type="button" onClick={importDatabaseBackup} disabled={!backupFile || backupBusy}><Upload size={16} />Restore backup</button></div>
    </section>
  </>

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}><div className="brand"><span className="brand-mark"><Landmark size={20} /></span><span>ledgerly<small>FINANCE MANAGER</small></span><button className="close-nav" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X size={19} /></button></div><div className="nav-caption">WORKSPACE</div><nav aria-label="Main navigation">{pages.map(({ name, icon: Icon }) => <button key={name} className={`nav-item ${page === name ? 'nav-active' : ''}`} onClick={() => go(name)}><Icon size={18} /><span>{name}</span>{name === 'Pending Payments' && pending.length > 0 && <small>{pending.length}</small>}</button>)}</nav><div className="sidebar-bottom"><div className="api-status"><span className="status-dot" /><span><b>API workspace</b><small>{API}</small></span></div><div className="sidebar-foot">Ledgerly Finance - v1.0</div></div></aside>
    {mobileNav && <button aria-label="Close navigation overlay" className="nav-overlay" onClick={() => setMobileNav(false)} />}
    <main className="main-area"><header className="topbar"><button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={21} /></button><div className="breadcrumb">Workspace <ChevronRight size={14} /> <b>{page}</b></div><div className="topbar-right"><span className="today-label">{new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(new Date())}</span><span className="avatar user-avatar">L</span></div></header>
      <div className="page-content">{error && <div className="alert alert-error" role="alert"><CircleAlert size={18} /><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}{notice && <div className="alert alert-success" role="status"><Check size={18} /><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={16} /></button></div>}{content}</div>
    </main>
    {customerEditor !== false && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setCustomerEditor(false) }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="customer-form-title"><div className="modal-heading"><div><h2 id="customer-form-title">{customerEditor ? 'Edit customer' : 'Add customer'}</h2><p>Keep customer records accurate and up to date.</p></div><button className="icon-button" aria-label="Close" onClick={() => setCustomerEditor(false)}><X size={19} /></button></div><form className="stack-form" onSubmit={saveCustomer}>{error && <div className="alert alert-error" role="alert"><CircleAlert size={17} /><span>{error}</span></div>}<Field label="Full name" required><input value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} autoFocus required placeholder="Full name" /></Field><Field label="Mobile number"><input type="tel" value={customerForm.mobileNumber} onChange={(e) => setCustomerForm({ ...customerForm, mobileNumber: e.target.value })} placeholder="Enter phone number (optional)" /></Field><Field label="Address"><textarea rows={3} value={customerForm.address} onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })} placeholder="Street, city, postal code (optional)" /></Field>{customerEditor && <Field label="Status" required><select value={customerForm.status} onChange={(e) => setCustomerForm({ ...customerForm, status: e.target.value })}><option value="Active">Active</option><option value="Inactive">Inactive</option></select></Field>}<div className="modal-actions"><button className="button button-outline" type="button" onClick={() => setCustomerEditor(false)}>Cancel</button><button className="button button-primary" type="submit">{customerEditor ? 'Save changes' : 'Add customer'}</button></div></form></section></div>}
    {confirmation && <div className="modal-backdrop" role="presentation"><section className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-message"><div className="modal-heading"><div><h2 id="confirmation-title">{confirmation.title}</h2><p id="confirmation-message">{confirmation.message}</p></div><button className="icon-button" aria-label="Cancel" onClick={() => setConfirmation(null)}><X size={19} /></button></div><div className="modal-actions"><button className="button button-outline" type="button" onClick={() => setConfirmation(null)}>Cancel</button><button className="button button-primary" type="button" disabled={backupBusy} onClick={() => { const action = confirmation.action; setConfirmation(null); action() }}>{confirmation.confirmLabel}</button></div></section></div>}
  </div>
}

function DataState({ loading, error, empty, emptyText, children }: { loading: boolean; error: string; empty: boolean; emptyText: string; children: ReactNode }) {
  if (loading) return <div className="state-message"><LoaderCircle className="spin" size={20} /><span>Loading records...</span></div>
  if (empty) return <div className="state-message"><FileText size={20} /><span>{error ? 'Records could not be loaded.' : emptyText}</span></div>
  return <>{children}</>
}
function LoadingOrEmpty({ loading, text }: { loading: boolean; text: string }) {
  return <div className="panel state-message">{loading ? <LoaderCircle className="spin" size={20} /> : <CircleAlert size={19} />}<span>{loading ? 'Loading balances...' : text}</span></div>
}
function PendingTable({ data, customers, onExport }: { data: Record<string, unknown>[]; customers: Customer[]; onExport: () => void }) {
  if (!data.length) return <div className="state-message"><FileText size={20} /><span>No pending payments to display.</span></div>
  const findKey = (row: Record<string, unknown>, options: string[]) => options.find((candidate) => row[candidate] !== undefined && row[candidate] !== null)
  const known = ['id', 'loanId', 'customerId', 'customerName', 'amount', 'dueDate', 'nextInstallmentDate', 'nextPaymentDate', 'nextDueDate', 'paymentDate', 'date', 'status', 'installmentAmount']
  const extras = [...new Set(data.flatMap((row) => Object.keys(row)))].filter((key) => !known.includes(key) && !key.startsWith('_')).slice(0, 3)
  return <><div className="table-toolbar inner-toolbar"><span className="record-count">{data.length} pending payment{data.length === 1 ? '' : 's'}</span><button className="button button-outline" onClick={onExport} type="button"><Download size={16} />Export PDF</button></div><div className="table-wrap"><table><thead><tr><th>Customer</th><th>Loan</th><th>Due date</th><th>Next payment</th><th>Amount</th><th>Status</th>{extras.map((key) => <th key={key}>{key.replace(/([A-Z])/g, ' $1')}</th>)}</tr></thead><tbody>{data.map((row, i) => { const customerId = row.customerId; const due = findKey(row, ['nextInstallmentDate', 'dueDate', 'paymentDate', 'date']); const next = findKey(row, ['nextPaymentDate', 'nextDueDate']); const amount = findKey(row, ['amount', 'installmentAmount']); return <tr key={String(row.id ?? `${row.loanId ?? 'payment'}-${i}`)}><td>{text(row.customerName ?? (customerId !== undefined ? nameFor(customers, customerId) : '-'))}</td><td>{text(row.loanId ?? row.id ?? '—')}</td><td>{due ? dateLabel(row[due]) : '-'}</td><td>{next ? dateLabel(row[next]) : '-'}</td><td>{amount ? money(row[amount]) : '-'}</td><td>{row.status !== undefined ? <span className="status-pill">{text(row.status)}</span> : '-'}</td>{extras.map((key) => <td key={key}>{text(row[key])}</td>)}</tr> })}</tbody></table></div></>
}
export default App

