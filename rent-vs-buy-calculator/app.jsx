const { useState, useEffect, useMemo, useRef } = React;

const STORAGE_KEY = 'pmt_rent_vs_buy_data';

const REGION_PRESETS = {
  Auckland: {
    propertyInflationRateAnnual: 3.0,
    rentInflationRateAnnual: 3.5,
    councilRatesAnnual: 3200,
    houseInsuranceAnnual: 1600,
  },
  Wellington: {
    propertyInflationRateAnnual: 2.5,
    rentInflationRateAnnual: 3.0,
    councilRatesAnnual: 2800,
    houseInsuranceAnnual: 1500,
  },
  Canterbury: {
    propertyInflationRateAnnual: 2.0,
    rentInflationRateAnnual: 2.5,
    councilRatesAnnual: 2400,
    houseInsuranceAnnual: 1400,
  },
};

const DEFAULT_STATE = {
  mode: 'simple',
  horizonYears: 30,
  region: 'Auckland',
  propertyPrice: 850000,
  depositAmount: 170000,
  monthlyRent: 2500,
  avgInterestRateAnnual: 5.25,
  propertyInflationRateAnnual: REGION_PRESETS.Auckland.propertyInflationRateAnnual,
  maintenanceRateAnnual: 0.75,
  councilRatesAnnual: REGION_PRESETS.Auckland.councilRatesAnnual,
  houseInsuranceAnnual: REGION_PRESETS.Auckland.houseInsuranceAnnual,
  rentInflationRateAnnual: REGION_PRESETS.Auckland.rentInflationRateAnnual,
  investmentReturnAnnual: 6.0,
  PIR: 0.28,
  savingsDisciplinePercent: 70,
  mortgageTranches: [
    {
      name: 'A',
      principal: 680000,
      totalTermMonths: 360,
      floatingRateAnnual: 5.25,
      fixedRateAnnual: 4.75,
      fixedPeriodMonths: 60,
    },
    {
      name: 'B',
      principal: 0,
      totalTermMonths: 360,
      floatingRateAnnual: 5.25,
      fixedRateAnnual: 0,
      fixedPeriodMonths: 0,
    },
    {
      name: 'C',
      principal: 0,
      totalTermMonths: 360,
      floatingRateAnnual: 5.25,
      fixedRateAnnual: 0,
      fixedPeriodMonths: 0,
    },
  ],
};

function loadSavedState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(stored);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Unable to persist state to localStorage', error);
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatCurrency(value) {
  if (Number.isNaN(value) || value == null) return '—';
  return value.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 });
}

function formatPercent(value) {
  if (Number.isNaN(value) || value == null) return '—';
  return `${value.toFixed(2)}%`;
}

function monthlyPayment(balance, annualRate, months) {
  if (months <= 0) return 0;
  const monthlyRate = annualRate / 12 / 100;
  if (monthlyRate <= 0) return balance / months;
  return (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
}

function amortizeTrancheSchedule(tranche, horizonMonths) {
  const schedule = [];
  let remainingBalance = tranche.principal;
  let monthsRemaining = tranche.totalTermMonths;
  let fixedMonthsLeft = tranche.fixedPeriodMonths;

  for (let monthIndex = 0; monthIndex < horizonMonths && remainingBalance > 0; monthIndex += 1) {
    const rateAnnual = fixedMonthsLeft > 0 ? tranche.fixedRateAnnual : tranche.floatingRateAnnual;
    const payment = monthlyPayment(remainingBalance, rateAnnual, monthsRemaining);
    const monthlyRate = rateAnnual / 12 / 100;
    const interestPayment = remainingBalance * monthlyRate;
    let principalPayment = payment - interestPayment;
    if (principalPayment > remainingBalance) {
      principalPayment = remainingBalance;
    }
    remainingBalance = Math.max(0, remainingBalance - principalPayment);
    schedule.push({ monthIndex, payment, interestPayment, principalPayment, remainingBalance, rateAnnual });
    monthsRemaining -= 1;
    if (fixedMonthsLeft > 0) fixedMonthsLeft -= 1;
  }

  return schedule;
}

function buildNetWealthSeries(state) {
  const horizonMonths = state.horizonYears * 12;
  const tranches = state.mode === 'advanced'
    ? state.mortgageTranches.filter(t => t.principal > 0)
    : [{
        name: 'A',
        principal: Math.max(0, state.propertyPrice - state.depositAmount),
        totalTermMonths: 360,
        fixedRateAnnual: state.avgInterestRateAnnual,
        floatingRateAnnual: state.avgInterestRateAnnual,
        fixedPeriodMonths: 0,
      }];

  const trancheStates = tranches.map(tranche => ({
    ...tranche,
    remainingBalance: tranche.principal,
    monthsRemaining: tranche.totalTermMonths,
    fixedMonthsLeft: tranche.fixedPeriodMonths,
  }));

  let propertyValue = state.propertyPrice;
  let investorBalance = state.depositAmount;
  let yearStartBalance = investorBalance;
  let yearContributions = 0;
  const monthlyRateProperty = state.propertyInflationRateAnnual / 12 / 100;
  const monthlyRateInvestment = state.investmentReturnAnnual / 12 / 100;
  const monthlyRentInflation = state.rentInflationRateAnnual / 12 / 100;
  const monthlyMaintenanceRate = state.maintenanceRateAnnual / 12 / 100;
  const monthlyFixedCost = (state.councilRatesAnnual + state.houseInsuranceAnnual) / 12;

  const series = [];
  let cumulativeHomeownerCost = 0;

  for (let monthIndex = 0; monthIndex < horizonMonths; monthIndex += 1) {
    if (monthIndex > 0) propertyValue *= 1 + monthlyRateProperty;
    let monthlyMortgagePayment = 0;
    let totalLoanBalance = 0;

    trancheStates.forEach(tranche => {
      if (tranche.remainingBalance <= 0) return;
      const rateAnnual = tranche.fixedMonthsLeft > 0 ? tranche.fixedRateAnnual : tranche.floatingRateAnnual;
      const payment = monthlyPayment(tranche.remainingBalance, rateAnnual, tranche.monthsRemaining);
      const monthlyRate = rateAnnual / 12 / 100;
      const interestPayment = tranche.remainingBalance * monthlyRate;
      let principalPayment = payment - interestPayment;
      if (principalPayment > tranche.remainingBalance) principalPayment = tranche.remainingBalance;
      tranche.remainingBalance = Math.max(0, tranche.remainingBalance - principalPayment);
      tranche.monthsRemaining -= 1;
      if (tranche.fixedMonthsLeft > 0) tranche.fixedMonthsLeft -= 1;
      monthlyMortgagePayment += interestPayment + principalPayment;
      totalLoanBalance += tranche.remainingBalance;
    });

    const homeownerCost = monthlyMortgagePayment + monthlyFixedCost + propertyValue * monthlyMaintenanceRate;
    const rentCost = state.monthlyRent * Math.pow(1 + monthlyRentInflation, monthIndex);
    const monthlySurplus = Math.max(0, homeownerCost - rentCost);
    const contribution = monthlySurplus * (state.savingsDisciplinePercent / 100);
    investorBalance += contribution;
    investorBalance += investorBalance * monthlyRateInvestment;
    yearContributions += contribution;

    if ((monthIndex + 1) % 12 === 0) {
      const annualGain = investorBalance - yearStartBalance - yearContributions;
      if (annualGain > 0) {
        const tax = annualGain * Math.min(state.PIR, 1);
        investorBalance -= tax;
      }
      yearStartBalance = investorBalance;
      yearContributions = 0;
    }

    cumulativeHomeownerCost += homeownerCost;
    const buyerEquity = propertyValue - totalLoanBalance;
    series.push({
      monthIndex,
      year: Number((monthIndex / 12).toFixed(2)),
      buyerEquity,
      renterPortfolio: investorBalance,
      homeownerCost,
      rentCost,
      breakEven: investorBalance >= buyerEquity,
    });
  }

  return series;
}

function findBreakEvenYear(series) {
  const crossover = series.find(point => point.breakEven);
  if (!crossover) return null;
  return Math.ceil((crossover.monthIndex + 1) / 12);
}

function App() {
  const [state, setState] = useState(loadSavedState);
  const [showAdvanced, setShowAdvanced] = useState(loadSavedState().mode === 'advanced');
  const saveTimer = useRef(null);

  useEffect(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(() => saveState(state), 300);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state]);

  const chartSeries = useMemo(() => buildNetWealthSeries(state), [state]);
  const breakEvenYear = useMemo(() => findBreakEvenYear(chartSeries), [chartSeries]);
  const latestPoint = chartSeries[chartSeries.length - 1] || { buyerEquity: 0, renterPortfolio: 0 };

  function updateField(key, value) {
    setState(prev => ({ ...prev, [key]: value }));
  }

  function updateTranche(index, field, value) {
    setState(prev => {
      const tranches = prev.mortgageTranches.map((tranche, idx) => {
        if (idx !== index) return tranche;
        return { ...tranche, [field]: value };
      });
      return { ...prev, mortgageTranches: tranches };
    });
  }

  function applyRegion(region) {
    setState(prev => ({
      ...prev,
      region,
      propertyInflationRateAnnual: REGION_PRESETS[region].propertyInflationRateAnnual,
      rentInflationRateAnnual: REGION_PRESETS[region].rentInflationRateAnnual,
      councilRatesAnnual: REGION_PRESETS[region].councilRatesAnnual,
      houseInsuranceAnnual: REGION_PRESETS[region].houseInsuranceAnnual,
    }));
  }

  const currentRate = state.mode === 'advanced'
    ? state.mortgageTranches[0]?.fixedRateAnnual || state.avgInterestRateAnnual
    : state.avgInterestRateAnnual;

  const simpleMortgageBalance = Math.max(0, state.propertyPrice - state.depositAmount);

  return (
    <div className="page-shell">
      <div className="header">
        <div>
          <h1>NZ Rent vs Buy Calculator</h1>
          <p className="small-note">Local browser-only savings with progressive disclosure, multi-tranche mortgage support, PIR tax, and investment discipline.</p>
        </div>
      </div>

      <section className="grid-2">
        <div className="card">
          <div className="label">Mode</div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className={state.mode === 'simple' ? 'active' : ''} onClick={() => updateField('mode', 'simple')}>Simple Mode</button>
            <button type="button" className={state.mode === 'advanced' ? 'active' : ''} onClick={() => updateField('mode', 'advanced')}>Advanced Mode</button>
          </div>
        </div>

        <div className="card">
          <div className="label">Advanced NZ Mortgage Features</div>
          <button type="button" onClick={() => setShowAdvanced(open => !open)}>{showAdvanced ? 'Hide' : 'Show'} advanced settings</button>
        </div>
      </section>

      <section className="grid-3">
        <div className="card input-group">
          <label className="label" htmlFor="propertyPrice">Property Price</label>
          <input id="propertyPrice" type="number" value={state.propertyPrice} onChange={e => updateField('propertyPrice', Number(e.target.value))} />
        </div>
        <div className="card input-group">
          <label className="label" htmlFor="depositAmount">Deposit</label>
          <input id="depositAmount" type="number" value={state.depositAmount} onChange={e => updateField('depositAmount', Number(e.target.value))} />
        </div>
        <div className="card input-group">
          <label className="label" htmlFor="monthlyRent">Monthly Rent</label>
          <input id="monthlyRent" type="number" value={state.monthlyRent} onChange={e => updateField('monthlyRent', Number(e.target.value))} />
        </div>
      </section>

      <section className="grid-3">
        <div className="card input-group">
          <label className="label" htmlFor="avgInterestRateAnnual">Average Interest Rate</label>
          <input id="avgInterestRateAnnual" type="number" step="0.01" value={state.avgInterestRateAnnual} onChange={e => updateField('avgInterestRateAnnual', Number(e.target.value))} />
        </div>
        <div className="card input-group">
          <label className="label" htmlFor="investmentReturnAnnual">Expected Investment Return</label>
          <input id="investmentReturnAnnual" type="number" step="0.1" value={state.investmentReturnAnnual} onChange={e => updateField('investmentReturnAnnual', Number(e.target.value))} />
        </div>
        <div className="card input-group">
          <label className="label" htmlFor="savingsDisciplinePercent">Savings Discipline</label>
          <input id="savingsDisciplinePercent" type="range" min="0" max="100" value={state.savingsDisciplinePercent} onChange={e => updateField('savingsDisciplinePercent', Number(e.target.value))} />
          <div>{state.savingsDisciplinePercent}% of surplus invested</div>
        </div>
      </section>

      {showAdvanced && (
        <>
          <h2 className="section-title">Advanced NZ Mortgage Features</h2>
          <section className="card">
            <div className="grid-3">
              <div className="input-group">
                <label className="label" htmlFor="region">Region</label>
                <select id="region" value={state.region} onChange={e => applyRegion(e.target.value)}>
                  {Object.keys(REGION_PRESETS).map(region => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="label" htmlFor="PIR">PIR</label>
                <input id="PIR" type="number" step="0.01" value={state.PIR * 100} onChange={e => updateField('PIR', clamp(Number(e.target.value) / 100, 0, 1))} />
                <div className="small-note">Annual PIE tax rate (default capped at 28%).</div>
              </div>
              <div className="input-group">
                <label className="label" htmlFor="maintenanceRateAnnual">Maintenance Rate</label>
                <input id="maintenanceRateAnnual" type="number" step="0.01" value={state.maintenanceRateAnnual} onChange={e => updateField('maintenanceRateAnnual', Number(e.target.value))} />
                <div className="small-note">Annual maintenance percentage of property value.</div>
              </div>
            </div>

            <div className="label" style={{ marginTop: '1rem' }}>Regional cost presets</div>
            <div className="region-buttons">
              {Object.keys(REGION_PRESETS).map(region => (
                <button key={region} type="button" className={state.region === region ? 'active' : ''} onClick={() => applyRegion(region)}>{region}</button>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="label">Mortgage Tranches</div>
            <div className="small-note">Enter up to three split loans. Fixed-rate tranches automatically move to floating terms after they expire.</div>
            {state.mortgageTranches.map((tranche, index) => (
              <div key={tranche.name} className="grid-3" style={{ marginTop: '1rem' }}>
                <div className="input-group">
                  <label className="label">Tranche {tranche.name} Principal</label>
                  <input type="number" value={tranche.principal} onChange={e => updateTranche(index, 'principal', Number(e.target.value))} />
                </div>
                <div className="input-group">
                  <label className="label">Fixed Rate</label>
                  <input type="number" step="0.01" value={tranche.fixedRateAnnual} onChange={e => updateTranche(index, 'fixedRateAnnual', Number(e.target.value))} />
                </div>
                <div className="input-group">
                  <label className="label">Fixed Term (months)</label>
                  <input type="number" value={tranche.fixedPeriodMonths} onChange={e => updateTranche(index, 'fixedPeriodMonths', Number(e.target.value))} />
                </div>
                <div className="input-group">
                  <label className="label">Floating Rate</label>
                  <input type="number" step="0.01" value={tranche.floatingRateAnnual} onChange={e => updateTranche(index, 'floatingRateAnnual', Number(e.target.value))} />
                </div>
                <div className="input-group">
                  <label className="label">Term (months)</label>
                  <input type="number" value={tranche.totalTermMonths} onChange={e => updateTranche(index, 'totalTermMonths', Number(e.target.value))} />
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      <section className="section-title">Projection Summary</section>
      <section className="grid-2">
        <div className="card">
          <div className="summary-label">Projected Buyer Equity after {state.horizonYears} years</div>
          <div className="summary-value">{formatCurrency(latestPoint.buyerEquity)}</div>
        </div>
        <div className="card">
          <div className="summary-label">Projected Renter Portfolio after {state.horizonYears} years</div>
          <div className="summary-value">{formatCurrency(latestPoint.renterPortfolio)}</div>
        </div>
      </section>

      <section className="card chart-panel">
        <h2>Net Wealth Horizon</h2>
        <div className="small-note">Chart data structures are prepared for buyer equity vs renter portfolio over the selected horizon.</div>
        <div className="axis">
          <strong>Break-even crossover year:</strong> {breakEvenYear ? `${breakEvenYear} year(s)` : 'Not reached within horizon'}
        </div>
        <pre>{JSON.stringify(chartSeries.slice(0, 12).map(point => ({ year: point.year, buyerEquity: Math.round(point.buyerEquity), renterPortfolio: Math.round(point.renterPortfolio) })), null, 2)}</pre>
      </section>

      <section className="card">
        <h3>Debug data structure</h3>
        <div className="small-note">The UI prepares the following arrays for charting and crossover detection.</div>
        <pre>{JSON.stringify({ chartSeriesLength: chartSeries.length, breakEvenYear, lastPoint: { buyerEquity: Math.round(latestPoint.buyerEquity), renterPortfolio: Math.round(latestPoint.renterPortfolio) } }, null, 2)}</pre>
      </section>
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById('root'));
