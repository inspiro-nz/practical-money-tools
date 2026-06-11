export type CalculatorMode = 'simple' | 'advanced';

export interface MortgageTranche {
  name?: string;
  principal: number;
  totalTermMonths: number;
  floatingRateAnnual: number;
  fixedRateAnnual?: number;
  fixedPeriodMonths?: number;
}

export interface RentVsBuyInputs {
  mode: CalculatorMode;
  horizonYears: number;
  propertyPrice: number;
  depositAmount: number;
  monthlyRent: number;
  avgInterestRateAnnual: number;
  propertyInflationRateAnnual: number;
  maintenanceRateAnnual: number;
  councilRatesAnnual: number;
  houseInsuranceAnnual: number;
  rentInflationRateAnnual: number;
  investmentReturnAnnual: number;
  PIR: number;
  savingsDisciplinePercent: number;
  mortgageTranches: MortgageTranche[];
}

export interface NetWealthPoint {
  monthIndex: number;
  year: number;
  buyerEquity: number;
  renterPortfolio: number;
  homeownerCost: number;
  rentCost: number;
  breakEven: boolean;
}

interface TrancheRuntimeState {
  name: string;
  remainingBalance: number;
  monthsRemaining: number;
  fixedMonthsLeft: number;
  floatingRateAnnual: number;
  fixedRateAnnual: number;
}

interface TrancheStepResult {
  interestPayment: number;
  principalPayment: number;
  paymentTotal: number;
  rateAnnual: number;
  remainingBalance: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sanitizeNumber(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function getMonthlyRate(annualRate: number): number {
  return annualRate / 12 / 100;
}

export function monthlyPaymentForBalance(
  balance: number,
  monthlyRate: number,
  remainingMonths: number,
): number {
  if (remainingMonths <= 0) {
    return 0;
  }
  if (monthlyRate <= 0) {
    return balance / remainingMonths;
  }
  return (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -remainingMonths));
}

/**
 * Advances a tranche's runtime state by one month, mutating it in place.
 *
 * Once a tranche's term has elapsed (monthsRemaining <= 0) or its balance is
 * paid off, it contributes nothing and its balance is pinned at 0. Without
 * this guard, monthlyPaymentForBalance returns 0 for an exhausted term while
 * interest still accrues, which would make the balance grow forever (negative
 * amortization) instead of staying at 0.
 */
export function stepTranche(state: TrancheRuntimeState): TrancheStepResult {
  if (state.remainingBalance <= 0 || state.monthsRemaining <= 0) {
    state.remainingBalance = 0;
    state.monthsRemaining = Math.max(0, state.monthsRemaining);
    return {
      interestPayment: 0,
      principalPayment: 0,
      paymentTotal: 0,
      rateAnnual: state.fixedMonthsLeft > 0 ? state.fixedRateAnnual : state.floatingRateAnnual,
      remainingBalance: 0,
    };
  }

  const rateAnnual = state.fixedMonthsLeft > 0 ? state.fixedRateAnnual : state.floatingRateAnnual;
  const monthlyRate = getMonthlyRate(rateAnnual);
  const payment = monthlyPaymentForBalance(state.remainingBalance, monthlyRate, state.monthsRemaining);
  const interestPayment = state.remainingBalance * monthlyRate;
  let principalPayment = payment - interestPayment;

  // Force a full payoff on the final month (or if rounding overshoots) so the
  // balance lands on exactly 0 rather than a negative or tiny residual.
  if (state.monthsRemaining <= 1 || principalPayment > state.remainingBalance) {
    principalPayment = state.remainingBalance;
  }
  // Guard against negative amortization (e.g. pathological/negative rates).
  if (principalPayment < 0) {
    principalPayment = 0;
  }

  state.remainingBalance = Math.max(0, state.remainingBalance - principalPayment);
  state.monthsRemaining -= 1;
  if (state.fixedMonthsLeft > 0) {
    state.fixedMonthsLeft -= 1;
  }

  return {
    interestPayment,
    principalPayment,
    paymentTotal: interestPayment + principalPayment,
    rateAnnual,
    remainingBalance: state.remainingBalance,
  };
}

/**
 * Returns the mortgage tranches that actually carry debt for the given
 * inputs. In simple mode this synthesizes a single tranche from the
 * property price, deposit, and average interest rate.
 */
export function getActiveTranches(inputs: RentVsBuyInputs): MortgageTranche[] {
  if (inputs.mode === 'advanced') {
    return inputs.mortgageTranches.filter(tranche => tranche.principal > 0);
  }
  return [{
    name: 'A',
    principal: Math.max(0, inputs.propertyPrice - inputs.depositAmount),
    totalTermMonths: 360,
    floatingRateAnnual: inputs.avgInterestRateAnnual,
    fixedRateAnnual: inputs.avgInterestRateAnnual,
    fixedPeriodMonths: 0,
  }];
}

/**
 * Validates calculator inputs and returns a list of human-readable issues.
 * An empty array means the inputs are usable as-is.
 */
export function validateRentVsBuyInputs(inputs: RentVsBuyInputs): string[] {
  const issues: string[] = [];

  if (inputs.horizonYears <= 0) {
    issues.push('Horizon (years) must be greater than 0.');
  }

  if (inputs.mode === 'advanced') {
    const totalPrincipal = inputs.mortgageTranches.reduce(
      (sum, tranche) => sum + Math.max(0, tranche.principal || 0),
      0,
    );
    if (totalPrincipal <= 0) {
      issues.push('Add a principal amount greater than $0 to at least one mortgage tranche, or switch to Simple Mode.');
    }

    inputs.mortgageTranches.forEach(tranche => {
      if (tranche.principal > 0 && tranche.totalTermMonths <= 0) {
        const label = tranche.name ? `Tranche ${tranche.name}` : 'A tranche';
        issues.push(`${label} has a principal but a term of 0 months — set a term greater than 0.`);
      }
    });
  }

  return issues;
}

/**
 * Builds the month-by-month buyer-vs-renter net wealth projection. This is
 * the single source of truth for the calculator's projection math, used by
 * the UI to drive the chart, summary figures, and break-even detection.
 */
export function buildNetWealthSeries(inputs: RentVsBuyInputs): NetWealthPoint[] {
  const horizonMonths = Math.max(0, Math.round(inputs.horizonYears * 12));

  const tranches: TrancheRuntimeState[] = getActiveTranches(inputs).map((tranche, index) => ({
    name: tranche.name ?? String.fromCharCode(65 + index),
    remainingBalance: Math.max(0, tranche.principal),
    monthsRemaining: Math.max(0, tranche.totalTermMonths),
    fixedMonthsLeft: Math.max(0, tranche.fixedPeriodMonths ?? 0),
    floatingRateAnnual: tranche.floatingRateAnnual,
    fixedRateAnnual: tranche.fixedRateAnnual ?? tranche.floatingRateAnnual,
  }));

  let propertyValue = inputs.propertyPrice;
  let investorBalance = Math.max(0, inputs.depositAmount);
  let yearStartBalance = investorBalance;
  let yearContributions = 0;

  const monthlyPropertyInflation = getMonthlyRate(inputs.propertyInflationRateAnnual);
  const monthlyInvestmentReturn = getMonthlyRate(inputs.investmentReturnAnnual);
  const monthlyRentInflation = getMonthlyRate(inputs.rentInflationRateAnnual);
  const monthlyMaintenanceRate = getMonthlyRate(inputs.maintenanceRateAnnual);
  const monthlyFixedCost = (inputs.councilRatesAnnual + inputs.houseInsuranceAnnual) / 12;
  const PIR = clamp(inputs.PIR, 0, 1);
  const savingsDiscipline = clamp(inputs.savingsDisciplinePercent, 0, 100) / 100;

  const series: NetWealthPoint[] = [];

  for (let monthIndex = 0; monthIndex < horizonMonths; monthIndex += 1) {
    if (monthIndex > 0) {
      propertyValue *= 1 + monthlyPropertyInflation;
    }

    let monthlyMortgagePayment = 0;
    let totalLoanBalance = 0;
    tranches.forEach(tranche => {
      const step = stepTranche(tranche);
      monthlyMortgagePayment += step.paymentTotal;
      totalLoanBalance += tranche.remainingBalance;
    });

    const homeownerCost = monthlyMortgagePayment + monthlyFixedCost + propertyValue * monthlyMaintenanceRate;
    const rentCost = inputs.monthlyRent * Math.pow(1 + monthlyRentInflation, monthIndex);
    const monthlySurplus = Math.max(0, homeownerCost - rentCost);
    const contribution = monthlySurplus * savingsDiscipline;

    investorBalance += contribution;
    investorBalance += investorBalance * monthlyInvestmentReturn;
    yearContributions += contribution;

    if ((monthIndex + 1) % 12 === 0) {
      const annualGain = investorBalance - yearStartBalance - yearContributions;
      if (annualGain > 0) {
        investorBalance -= annualGain * PIR;
      }
      yearStartBalance = investorBalance;
      yearContributions = 0;
    }

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

export function findBreakEvenYear(series: NetWealthPoint[]): number | null {
  const crossover = series.find(point => point.breakEven);
  if (!crossover) return null;
  return Math.ceil((crossover.monthIndex + 1) / 12);
}
