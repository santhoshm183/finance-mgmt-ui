# Ledgerly Finance Management UI

A standalone, responsive React + TypeScript + Vite frontend for managing customers, loan accounts, cash flow, collections, and pending payments. It does not include or modify a backend and does not use seeded/demo records; displayed records come from the configured API.

## Requirements and setup

- Node.js 18+ and npm
- A backend implementing the API contract below (or configure the URL to your API)

```sh
npm install
Copy-Item .env.example .env.local
# Set VITE_API_BASE_URL in .env.local if your API is not at http://localhost:8080
npm run dev
```

`VITE_API_BASE_URL` defaults to `http://localhost:8080` when unset. `VITE_CURRENCY` controls formatted currency (defaults to `USD`; use an ISO 4217 code such as `EUR` or `INR`). Vite reads environment values at startup; restart the dev server after changing `.env.local`.

## Scripts

- `npm run dev` â€” start the Vite development server
- `npm run build` â€” type-check and create the production build in `dist/`
- `npm run typecheck` â€” run TypeScript project checks
- `npm run preview` â€” serve the production build locally

## API contract used

- `GET /api/customers?search=` and `POST /api/customers`
- `GET /api/customers/{id}` and `PUT /api/customers/{id}`
- `GET /api/loans?customerId=` and `GET /api/loans/{id}`
- `POST /api/loans` with `customerId`, `loanType` (`INSTALLMENT_BASED` or `MONTHLY_INTEREST`), `principalAmount`, `interestRate`, `repaymentFrequency` (`DAILY`, `WEEKLY`, or `MONTHLY`), optional `weeklyDay`, `startDate`, and `installmentAmount`
- `GET /api/cash-flow` with `investmentAmount`, `financialBalance`, `profitAmount`, and `collectionAmount`
- `POST /api/cash-flow/transfers` with `fromAccount`, `amount`, and `date`
- `POST /api/collections` with `loanId`, `collectionDate`, `amount`, and `transactionType` (`COLLECTED` or `PROFIT`)
- `GET /api/payments/pending`

All API calls are made with `fetch`. HTTP, network, and validation errors are surfaced in the UI. Optional table columns from the API are rendered defensively, but the app does not depend on unlisted response fields.

