import {
  buildNetWealthSeries,
  findBreakEvenYear,
  validateRentVsBuyInputs,
  clamp,
  sanitizeNumber,
} from './nzRentVsBuyEngine';

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

function formatCurrency(value) {
  if (Number.isNaN(value) || value == null) return '—';
  return value.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 });
}

function App() {
  const [state, setState] = useState(loadSavedState);
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

  const validationIssues = useMemo(() => validateRentVsBuyInputs(state), [state]);
  const chartSeries = useMemo(() => buildNetWealthSeries(state), [state]);
  const breakEvenYear = useMemo(() => findBreakEvenYear(chartSeries), [chartSeries]);
  const latestPoint = chartSeries[chartSeries.length - 1] || { buyerEquity: 0, renterPortfolio: 0 };

  function updateField(key, value) {
    setState(prev => ({ ...prev, [key]: value }));
  }

  function updateNumericField(key, rawValue) {
    setState(prev => ({ ...prev, [key]: sanitizeNumber(rawValue, prev[key]) }));
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

  function updateTrancheNumericField(index, field, rawValue) {
    setState(prev => {
      const tranches = prev.mortgageTranches.map((tranche, idx) => {
        if (idx !== index) return tranche;
        return { ...tranche, [field]: sanitizeNumber(rawValue, tranche[field]) };
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

  return (
    <div className="page-shell">
      <div className="header">
        <div>
          <h1>NZ Rent vs Buy Calculator</h1>
          <p className="small-note">Local browser-only savings with progressive disclosure, multi-tranche mortgage support, PIR tax, and investment discipline.</p>
        </div>
      </div>

      {validationIssues.length > 0 && (
        <section className="card validation-warning">
          <div className="label">Check your inputs</div>
          <ul>
            {validationIssues.map(issue => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid-2">
        <div className="card">
          <div className="label">Mode</div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className={state.mode === 'simple' ? 'active' : ''} onClick={() => updateField('mode', 'simple')}>Simple Mode</button>
            <button type="button" className={state.mode === 'advanced' ? 'active' : ''} onClick={() => updateField('mode', 'advanced')}>Advanced Mode</button>
          </div>
        </div>

        <div className="card">
          <div className="label">Advanced Settings</div>
          <div style={{ fontSize: '0.9rem', color: '#475569' }}>{state.mode === 'advanced' ? 'Advanced settings shown below' : 'Toggle mode above to access advanced settings'}</div>
        </div>
      </section>

      <section className="grid-3">
        <div className="card input-group">
          <label className="label" htmlFor="propertyPrice">Property Price</label>
          <input id="propertyPrice" type="number" value={state.propertyPrice} onChange={e => updateNumericField('propertyPrice', e.target.value)} />
        </div>
        <div className="card input-group">
          <label className="label" htmlFor="depositAmount">Deposit</label>
          <input id="depositAmount" type="number" value={state.depositAmount} onChange={e => updateNumericField('depositAmount', e.target.value)} />
        </div>
        <div className="card input-group">
          <label className="label" htmlFor="monthlyRent">Monthly Rent</label>
          <input id="monthlyRent" type="number" value={state.monthlyRent} onChange={e => updateNumericField('monthlyRent', e.target.value)} />
        </div>
      </section>

      <section className="grid-3">
        <div className="card input-group">
          <label className="label" htmlFor="avgInterestRateAnnual">Average Interest Rate</label>
          <input id="avgInterestRateAnnual" type="number" step="0.01" value={state.avgInterestRateAnnual} onChange={e => updateNumericField('avgInterestRateAnnual', e.target.value)} />
        </div>
        <div className="card input-group">
          <label className="label" htmlFor="investmentReturnAnnual">Expected Investment Return</label>
          <input id="investmentReturnAnnual" type="number" step="0.1" value={state.investmentReturnAnnual} onChange={e => updateNumericField('investmentReturnAnnual', e.target.value)} />
        </div>
        <div className="card input-group">
          <label className="label" htmlFor="savingsDisciplinePercent">Savings Discipline</label>
          <input id="savingsDisciplinePercent" type="range" min="0" max="100" value={state.savingsDisciplinePercent} onChange={e => updateNumericField('savingsDisciplinePercent', e.target.value)} />
          <div>{state.savingsDisciplinePercent}% of surplus invested</div>
        </div>
      </section>

      {state.mode === 'advanced' && (
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
                <input id="PIR" type="number" step="0.01" value={state.PIR * 100} onChange={e => updateField('PIR', clamp(sanitizeNumber(e.target.value, state.PIR * 100) / 100, 0, 1))} />
                <div className="small-note">Annual PIE tax rate (default capped at 28%).</div>
              </div>
              <div className="input-group">
                <label className="label" htmlFor="maintenanceRateAnnual">Maintenance Rate</label>
                <input id="maintenanceRateAnnual" type="number" step="0.01" value={state.maintenanceRateAnnual} onChange={e => updateNumericField('maintenanceRateAnnual', e.target.value)} />
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
                  <input type="number" value={tranche.principal} onChange={e => updateTrancheNumericField(index, 'principal', e.target.value)} />
                </div>
                <div className="input-group">
                  <label className="label">Fixed Rate</label>
                  <input type="number" step="0.01" value={tranche.fixedRateAnnual} onChange={e => updateTrancheNumericField(index, 'fixedRateAnnual', e.target.value)} />
                </div>
                <div className="input-group">
                  <label className="label">Fixed Term (months)</label>
                  <input type="number" value={tranche.fixedPeriodMonths} onChange={e => updateTrancheNumericField(index, 'fixedPeriodMonths', e.target.value)} />
                </div>
                <div className="input-group">
                  <label className="label">Floating Rate</label>
                  <input type="number" step="0.01" value={tranche.floatingRateAnnual} onChange={e => updateTrancheNumericField(index, 'floatingRateAnnual', e.target.value)} />
                </div>
                <div className="input-group">
                  <label className="label">Term (months)</label>
                  <input type="number" value={tranche.totalTermMonths} onChange={e => updateTrancheNumericField(index, 'totalTermMonths', e.target.value)} />
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
        <h3>Data integrity check</h3>
        <div className="small-note">Series length: {chartSeries.length} months | Break-even: {breakEvenYear ? `Year ${breakEvenYear}` : 'Not reached'}</div>
      </section>
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById('root'));
