(function(){
  const React = window.React;
  const ReactDOM = window.ReactDOM;
  const STORAGE_KEY = 'pmt_rent_vs_buy_data';

  function loadSavedState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      return JSON.parse(stored);
    } catch (e) {
      return null;
    }
  }

  function formatCurrency(value) {
    if (Number.isNaN(value) || value == null) return '—';
    return value.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 });
  }

  function App() {
    const state = loadSavedState();
    const rootChildren = [];

    rootChildren.push(React.createElement('h1', { key: 'h1' }, 'NZ Rent vs Buy — Preview Bundle'));
    if (!state) {
      rootChildren.push(React.createElement('p', { key: 'no-state' }, 'No saved calculator state found in localStorage under "pmt_rent_vs_buy_data". Open the app via a static server to ensure full JSX app loads, or enter values below.'));
      rootChildren.push(React.createElement('p', { key: 'hint' }, 'Quick preview: this precompiled bundle shows persisted state and prevents a blank page when opening the file directly.'));
    } else {
      rootChildren.push(React.createElement('div', { key: 'summary', style: { marginTop: '0.75rem' } }, [
        React.createElement('div', { key: 'label' }, React.createElement('strong', null, 'Mode: '), state.mode || '—'),
        React.createElement('div', { key: 'price' }, React.createElement('strong', null, 'Property price: '), formatCurrency(state.propertyPrice)),
        React.createElement('div', { key: 'deposit' }, React.createElement('strong', null, 'Deposit: '), formatCurrency(state.depositAmount)),
        React.createElement('div', { key: 'rent' }, React.createElement('strong', null, 'Monthly rent: '), formatCurrency(state.monthlyRent)),
      ]));

      rootChildren.push(React.createElement('h3', { key: 'debug-h3', style: { marginTop: '1rem' } }, 'Raw saved state (truncated)'));
      rootChildren.push(React.createElement('pre', { key: 'json', style: { background: '#0f172a', color: '#f8fafc', padding: '1rem', borderRadius: '12px', overflowX: 'auto' } }, JSON.stringify(state, null, 2)));
    }

    return React.createElement('div', { style: { fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '1rem' } }, rootChildren);
  }

  document.addEventListener('DOMContentLoaded', function() {
    const mount = document.getElementById('root');
    if (!mount) return;
    ReactDOM.render(React.createElement(App), mount);
  });
})();
(function(){
  const e = React.createElement;
  const { useState, useEffect, useMemo, useRef } = React;
  const STORAGE_KEY = 'pmt_rent_vs_buy_data';
  const REGION_PRESETS = {
    Auckland: { propertyInflationRateAnnual: 3.0, rentInflationRateAnnual: 3.5, councilRatesAnnual: 3200, houseInsuranceAnnual: 1600 },
    Wellington: { propertyInflationRateAnnual: 2.5, rentInflationRateAnnual: 3.0, councilRatesAnnual: 2800, houseInsuranceAnnual: 1500 },
    Canterbury: { propertyInflationRateAnnual: 2.0, rentInflationRateAnnual: 2.5, councilRatesAnnual: 2400, houseInsuranceAnnual: 1400 },
  };
  const DEFAULT_STATE = {
    mode: 'simple', horizonYears: 30, region: 'Auckland', propertyPrice: 850000, depositAmount: 170000, monthlyRent: 2500,
    avgInterestRateAnnual: 5.25, propertyInflationRateAnnual: REGION_PRESETS.Auckland.propertyInflationRateAnnual,
    maintenanceRateAnnual: 0.75, councilRatesAnnual: REGION_PRESETS.Auckland.councilRatesAnnual,
    houseInsuranceAnnual: REGION_PRESETS.Auckland.houseInsuranceAnnual, rentInflationRateAnnual: REGION_PRESETS.Auckland.rentInflationRateAnnual,
    investmentReturnAnnual: 6.0, PIR: 0.28, savingsDisciplinePercent: 70,
    mortgageTranches: [
      { name: 'A', principal: 680000, totalTermMonths: 360, floatingRateAnnual: 5.25, fixedRateAnnual: 4.75, fixedPeriodMonths: 60 },
      { name: 'B', principal: 0, totalTermMonths: 360, floatingRateAnnual: 5.25, fixedRateAnnual: 0, fixedPeriodMonths: 0 },
      { name: 'C', principal: 0, totalTermMonths: 360, floatingRateAnnual: 5.25, fixedRateAnnual: 0, fixedPeriodMonths: 0 },
    ],
  };
  function loadSavedState() {
    try { const stored = localStorage.getItem(STORAGE_KEY); if (!stored) return { ...DEFAULT_STATE }; const parsed = JSON.parse(stored); return { ...DEFAULT_STATE, ...parsed }; } catch { return { ...DEFAULT_STATE }; }
  }
  function saveState(state) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) { console.warn('Unable to persist state to localStorage', error); } }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function formatCurrency(value) { if (Number.isNaN(value) || value == null) return '—'; return value.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }); }
  function monthlyPayment(balance, annualRate, months) { if (months <= 0) return 0; const monthlyRate = annualRate / 12 / 100; if (monthlyRate <= 0) return balance / months; return (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months)); }

  function buildNetWealthSeries(state) {
    const horizonMonths = state.horizonYears * 12;
    const tranches = state.mode === 'advanced' ? state.mortgageTranches.filter(t => t.principal > 0) : [{ name: 'A', principal: Math.max(0, state.propertyPrice - state.depositAmount), totalTermMonths: 360, fixedRateAnnual: state.avgInterestRateAnnual, floatingRateAnnual: state.avgInterestRateAnnual, fixedPeriodMonths: 0 }];
    const trancheStates = tranches.map(tranche => ({ ...tranche, remainingBalance: tranche.principal, monthsRemaining: tranche.totalTermMonths, fixedMonthsLeft: tranche.fixedPeriodMonths }));
    let propertyValue = state.propertyPrice; let investorBalance = state.depositAmount; let yearStartBalance = investorBalance; let yearContributions = 0;
    const monthlyRateProperty = state.propertyInflationRateAnnual / 12 / 100; const monthlyRateInvestment = state.investmentReturnAnnual / 12 / 100; const monthlyRentInflation = state.rentInflationRateAnnual / 12 / 100; const monthlyMaintenanceRate = state.maintenanceRateAnnual / 12 / 100; const monthlyFixedCost = (state.councilRatesAnnual + state.houseInsuranceAnnual) / 12;
    const series = []; let cumulativeHomeownerCost = 0;
    for (let monthIndex = 0; monthIndex < horizonMonths; monthIndex += 1) {
      if (monthIndex > 0) propertyValue *= 1 + monthlyRateProperty;
      let monthlyMortgagePayment = 0; let totalLoanBalance = 0;
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
        if (annualGain > 0) { const tax = annualGain * Math.min(state.PIR, 1); investorBalance -= tax; }
        yearStartBalance = investorBalance; yearContributions = 0;
      }
      cumulativeHomeownerCost += homeownerCost;
      const buyerEquity = propertyValue - totalLoanBalance;
      series.push({ monthIndex, year: Number((monthIndex / 12).toFixed(2)), buyerEquity, renterPortfolio: investorBalance, homeownerCost, rentCost, breakEven: investorBalance >= buyerEquity });
    }
    return series;
  }
  function findBreakEvenYear(series) { const crossover = series.find(point => point.breakEven); if (!crossover) return null; return Math.ceil((crossover.monthIndex + 1) / 12); }

  function App() {
    const [state, setState] = useState(loadSavedState);
    const [showAdvanced, setShowAdvanced] = useState(loadSavedState().mode === 'advanced');
    const saveTimer = useRef(null);
    useEffect(() => { if (saveTimer.current) { clearTimeout(saveTimer.current); } saveTimer.current = setTimeout(() => saveState(state), 300); return () => { if (saveTimer.current) clearTimeout(saveTimer.current); }; }, [state]);
    const chartSeries = useMemo(() => buildNetWealthSeries(state), [state]);
    const breakEvenYear = useMemo(() => findBreakEvenYear(chartSeries), [chartSeries]);
    const latestPoint = chartSeries[chartSeries.length - 1] || { buyerEquity: 0, renterPortfolio: 0 };
    function updateField(key, value) { setState(prev => ({ ...prev, [key]: value })); }
    function updateTranche(index, field, value) { setState(prev => { const tranches = prev.mortgageTranches.map((tranche, idx) => { if (idx !== index) return tranche; return { ...tranche, [field]: value }; }); return { ...prev, mortgageTranches: tranches }; }); }
    function applyRegion(region) { setState(prev => ({ ...prev, region, propertyInflationRateAnnual: REGION_PRESETS[region].propertyInflationRateAnnual, rentInflationRateAnnual: REGION_PRESETS[region].rentInflationRateAnnual, councilRatesAnnual: REGION_PRESETS[region].councilRatesAnnual, houseInsuranceAnnual: REGION_PRESETS[region].houseInsuranceAnnual, })); }
    const currentRate = state.mode === 'advanced' ? state.mortgageTranches[0]?.fixedRateAnnual || state.avgInterestRateAnnual : state.avgInterestRateAnnual;
    const simpleMortgageBalance = Math.max(0, state.propertyPrice - state.depositAmount);
    return e('div', { className: 'page-shell' },
      e('div', { className: 'header' }, e('div', null, e('h1', null, 'NZ Rent vs Buy Calculator'), e('p', { className: 'small-note' }, 'Local browser-only savings with progressive disclosure, multi-tranche mortgage support, PIR tax, and investment discipline.'))),
      e('section', { className: 'grid-2' },
        e('div', { className: 'card' }, e('div', { className: 'label' }, 'Mode'), e('div', { style: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap' } }, e('button', { type: 'button', className: state.mode === 'simple' ? 'active' : '', onClick: () => updateField('mode', 'simple') }, 'Simple Mode'), e('button', { type: 'button', className: state.mode === 'advanced' ? 'active' : '', onClick: () => updateField('mode', 'advanced') }, 'Advanced Mode'))),
        e('div', { className: 'card' }, e('div', { className: 'label' }, 'Advanced NZ Mortgage Features'), e('button', { type: 'button', onClick: () => setShowAdvanced(open => !open) }, showAdvanced ? 'Hide' : 'Show', ' advanced settings'))
      ),
      e('section', { className: 'grid-3' },
        e('div', { className: 'card input-group' }, e('label', { className: 'label', htmlFor: 'propertyPrice' }, 'Property Price'), e('input', { id: 'propertyPrice', type: 'number', value: state.propertyPrice, onChange: e1 => updateField('propertyPrice', Number(e1.target.value)) })),
        e('div', { className: 'card input-group' }, e('label', { className: 'label', htmlFor: 'depositAmount' }, 'Deposit'), e('input', { id: 'depositAmount', type: 'number', value: state.depositAmount, onChange: e1 => updateField('depositAmount', Number(e1.target.value)) })),
        e('div', { className: 'card input-group' }, e('label', { className: 'label', htmlFor: 'monthlyRent' }, 'Monthly Rent'), e('input', { id: 'monthlyRent', type: 'number', value: state.monthlyRent, onChange: e1 => updateField('monthlyRent', Number(e1.target.value)) }))
      ),
      e('section', { className: 'grid-3' },
        e('div', { className: 'card input-group' }, e('label', { className: 'label', htmlFor: 'avgInterestRateAnnual' }, 'Average Interest Rate'), e('input', { id: 'avgInterestRateAnnual', type: 'number', step: '0.01', value: state.avgInterestRateAnnual, onChange: e1 => updateField('avgInterestRateAnnual', Number(e1.target.value)) })),
        e('div', { className: 'card input-group' }, e('label', { className: 'label', htmlFor: 'investmentReturnAnnual' }, 'Expected Investment Return'), e('input', { id: 'investmentReturnAnnual', type: 'number', step: '0.1', value: state.investmentReturnAnnual, onChange: e1 => updateField('investmentReturnAnnual', Number(e1.target.value)) })),
        e('div', { className: 'card input-group' }, e('label', { className: 'label', htmlFor: 'savingsDisciplinePercent' }, 'Savings Discipline'), e('input', { id: 'savingsDisciplinePercent', type: 'range', min: '0', max: '100', value: state.savingsDisciplinePercent, onChange: e1 => updateField('savingsDisciplinePercent', Number(e1.target.value)) }), e('div', null, state.savingsDisciplinePercent + '% of surplus invested'))
      ),
      showAdvanced && e(React.Fragment, null,
        e('h2', { className: 'section-title' }, 'Advanced NZ Mortgage Features'),
        e('section', { className: 'card' }, e('div', { className: 'grid-3' },
          e('div', { className: 'input-group' }, e('label', { className: 'label', htmlFor: 'region' }, 'Region'), e('select', { id: 'region', value: state.region, onChange: e1 => applyRegion(e1.target.value) }, Object.keys(REGION_PRESETS).map(region => e('option', { key: region, value: region }, region)))),
          e('div', { className: 'input-group' }, e('label', { className: 'label', htmlFor: 'PIR' }, 'PIR'), e('input', { id: 'PIR', type: 'number', step: '0.01', value: state.PIR * 100, onChange: e1 => updateField('PIR', clamp(Number(e1.target.value) / 100, 0, 1)) }), e('div', { className: 'small-note' }, 'Annual PIE tax rate (default capped at 28%).')),
          e('div', { className: 'input-group' }, e('label', { className: 'label', htmlFor: 'maintenanceRateAnnual' }, 'Maintenance Rate'), e('input', { id: 'maintenanceRateAnnual', type: 'number', step: '0.01', value: state.maintenanceRateAnnual, onChange: e1 => updateField('maintenanceRateAnnual', Number(e1.target.value)) }), e('div', { className: 'small-note' }, 'Annual maintenance percentage of property value.'))
        ), e('div', { className: 'label', style: { marginTop: '1rem' } }, 'Regional cost presets'), e('div', { className: 'region-buttons' }, Object.keys(REGION_PRESETS).map(region => e('button', { key: region, type: 'button', className: state.region === region ? 'active' : '', onClick: () => applyRegion(region) }, region)))) ,
        e('section', { className: 'card' }, e('div', { className: 'label' }, 'Mortgage Tranches'), e('div', { className: 'small-note' }, 'Enter up to three split loans. Fixed-rate tranches automatically move to floating terms after they expire.'), state.mortgageTranches.map((tranche, index) => e('div', { key: tranche.name, className: 'grid-3', style: { marginTop: '1rem' } },
          e('div', { className: 'input-group' }, e('label', { className: 'label' }, 'Tranche ' + tranche.name + ' Principal'), e('input', { type: 'number', value: tranche.principal, onChange: e1 => updateTranche(index, 'principal', Number(e1.target.value)) })),
          e('div', { className: 'input-group' }, e('label', { className: 'label' }, 'Fixed Rate'), e('input', { type: 'number', step: '0.01', value: tranche.fixedRateAnnual, onChange: e1 => updateTranche(index, 'fixedRateAnnual', Number(e1.target.value)) })),
          e('div', { className: 'input-group' }, e('label', { className: 'label' }, 'Fixed Term (months)'), e('input', { type: 'number', value: tranche.fixedPeriodMonths, onChange: e1 => updateTranche(index, 'fixedPeriodMonths', Number(e1.target.value)) })),
          e('div', { className: 'input-group' }, e('label', { className: 'label' }, 'Floating Rate'), e('input', { type: 'number', step: '0.01', value: tranche.floatingRateAnnual, onChange: e1 => updateTranche(index, 'floatingRateAnnual', Number(e1.target.value)) })),
          e('div', { className: 'input-group' }, e('label', { className: 'label' }, 'Term (months)'), e('input', { type: 'number', value: tranche.totalTermMonths, onChange: e1 => updateTranche(index, 'totalTermMonths', Number(e1.target.value)) }))
        )))
      ),
      e('section', { className: 'section-title' }, 'Projection Summary'),
      e('section', { className: 'grid-2' }, e('div', { className: 'card' }, e('div', { className: 'summary-label' }, 'Projected Buyer Equity after ' + state.horizonYears + ' years'), e('div', { className: 'summary-value' }, formatCurrency(latestPoint.buyerEquity))), e('div', { className: 'card' }, e('div', { className: 'summary-label' }, 'Projected Renter Portfolio after ' + state.horizonYears + ' years'), e('div', { className: 'summary-value' }, formatCurrency(latestPoint.renterPortfolio)))) ,
      e('section', { className: 'card chart-panel' }, e('h2', null, 'Net Wealth Horizon'), e('div', { className: 'small-note' }, 'Chart data structures are prepared for buyer equity vs renter portfolio over the selected horizon.'), e('div', { className: 'axis' }, e('strong', null, 'Break-even crossover year:'), ' ', breakEvenYear ? breakEvenYear + ' year(s)' : 'Not reached within horizon'), e('pre', null, JSON.stringify(chartSeries.slice(0, 12).map(point => ({ year: point.year, buyerEquity: Math.round(point.buyerEquity), renterPortfolio: Math.round(point.renterPortfolio) })), null, 2))),
      e('section', { className: 'card' }, e('h3', null, 'Debug data structure'), e('div', { className: 'small-note' }, 'The UI prepares the following arrays for charting and crossover detection.'), e('pre', null, JSON.stringify({ chartSeriesLength: chartSeries.length, breakEvenYear, lastPoint: { buyerEquity: Math.round(latestPoint.buyerEquity), renterPortfolio: Math.round(latestPoint.renterPortfolio) } }, null, 2)))
    );
  }
  ReactDOM.render(e(App), document.getElementById('root'));
})();
