export type CalculatorMode = 'simple' | 'advanced';

export interface MortgageTrancheInput {
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
  depositAmount: number;
  propertyValue: number;
  propertyInflationRateAnnual: number;
  maintenanceRateAnnual: number;
  councilRatesAnnual: number;
  houseInsuranceAnnual: number;
  rentAnnual: number;
  rentInflationRateAnnual: number;
  investmentReturnAnnual: number;
  PIR: number;
  savingsDisciplinePercent: number;
  mortgageTranches: MortgageTrancheInput[];
}

export interface MortgageMonthRecord {
  monthIndex: number;
  trancheName: string;
  rateAnnual: number;
  monthlyPayment: number;
  interestPayment: number;
  principalPayment: number;
  remainingBalance: number;
}

export interface MortgageSchedule {
  trancheName: string;
  monthlyRecords: MortgageMonthRecord[];
  totalPaid: number;
  totalInterestPaid: number;
}

export interface InvestmentMonthRecord {
  monthIndex: number;
  beginningBalance: number;
  monthlyContribution: number;
  grossReturnEarned: number;
  PIRTaxPaid: number;
  endingBalance: number;
}

export interface PropertyMonthRecord {
  monthIndex: number;
  beginningValue: number;
  inflationRateAnnual: number;
  endingValue: number;
  maintenanceCost: number;
  homeownerExpense: number;
  rentCost: number;
  monthlySurplusIfRenting: number;
}

export interface RentVsBuyProjectionResult {
  horizonMonths: number;
  mortgageSchedules: MortgageSchedule[];
  investmentSchedule: InvestmentMonthRecord[];
  propertySchedule: PropertyMonthRecord[];
  totalHomeownerCost: number;
  totalRentCost: number;
  finalPropertyValue: number;
  finalInvestmentValue: number;
}

function getMonthlyRate(annualRate: number): number {
  return annualRate / 12 / 100;
}

function monthlyPaymentForBalance(
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

export function amortizeMortgageTranches(
  tranches: MortgageTrancheInput[],
  horizonMonths: number,
): MortgageSchedule[] {
  return tranches.map((tranche, trancheIndex) => {
    const trancheName = tranche.name ?? `Tranche ${String.fromCharCode(65 + trancheIndex)}`;
    const fixedRateAnnual = tranche.fixedRateAnnual ?? tranche.floatingRateAnnual;
    const fixedPeriodMonths = tranche.fixedPeriodMonths ?? 0;
    let remainingBalance = tranche.principal;
    let monthsRemaining = tranche.totalTermMonths;
    let fixedMonthsLeft = fixedPeriodMonths;
    let currentRateAnnual = fixedMonthsLeft > 0 ? fixedRateAnnual : tranche.floatingRateAnnual;
    let currentMonthlyRate = getMonthlyRate(currentRateAnnual);
    let payment = monthlyPaymentForBalance(remainingBalance, currentMonthlyRate, monthsRemaining);

    const monthlyRecords: MortgageMonthRecord[] = [];
    let totalPaid = 0;
    let totalInterestPaid = 0;

    for (let monthIndex = 0; monthIndex < Math.min(horizonMonths, tranche.totalTermMonths); monthIndex += 1) {
      const nextRateAnnual = fixedMonthsLeft > 0 ? fixedRateAnnual : tranche.floatingRateAnnual;
      const nextMonthlyRate = getMonthlyRate(nextRateAnnual);

      if (monthIndex === 0 || nextRateAnnual !== currentRateAnnual) {
        currentRateAnnual = nextRateAnnual;
        currentMonthlyRate = nextMonthlyRate;
        payment = monthlyPaymentForBalance(remainingBalance, currentMonthlyRate, monthsRemaining);
      }

      const interestPayment = remainingBalance * currentMonthlyRate;
      let principalPayment = payment - interestPayment;
      if (principalPayment > remainingBalance) {
        principalPayment = remainingBalance;
      }
      const actualPayment = interestPayment + principalPayment;
      remainingBalance = Math.max(0, remainingBalance - principalPayment);

      monthlyRecords.push({
        monthIndex,
        trancheName,
        rateAnnual: currentRateAnnual,
        monthlyPayment: actualPayment,
        interestPayment,
        principalPayment,
        remainingBalance,
      });

      totalPaid += actualPayment;
      totalInterestPaid += interestPayment;
      monthsRemaining -= 1;
      if (fixedMonthsLeft > 0) {
        fixedMonthsLeft -= 1;
      }
      if (remainingBalance <= 0) {
        break;
      }
    }

    return {
      trancheName,
      monthlyRecords,
      totalPaid,
      totalInterestPaid,
    };
  });
}

export function compoundPropertyValue(
  initialValue: number,
  inflationRateAnnual: number,
  maintenanceRateAnnual: number,
  horizonMonths: number,
  monthlyHomeownerBaseExpense: number,
  monthlyRentCost: number,
): PropertyMonthRecord[] {
  const schedule: PropertyMonthRecord[] = [];
  let currentValue = initialValue;
  const monthlyInflationRate = inflationRateAnnual / 12 / 100;
  const monthlyMaintenanceRate = maintenanceRateAnnual / 12 / 100;

  for (let monthIndex = 0; monthIndex < horizonMonths; monthIndex += 1) {
    const beginningValue = currentValue;
    currentValue *= 1 + monthlyInflationRate;
    const maintenanceCost = currentValue * monthlyMaintenanceRate;
    const homeownerExpense = monthlyHomeownerBaseExpense + maintenanceCost;
    const rentCost = monthlyRentCost;
    const monthlySurplusIfRenting = homeownerExpense - rentCost;

    schedule.push({
      monthIndex,
      beginningValue,
      inflationRateAnnual,
      endingValue: currentValue,
      maintenanceCost,
      homeownerExpense,
      rentCost,
      monthlySurplusIfRenting,
    });
  }

  return schedule;
}

export function compoundInvestmentPortfolio(
  initialDeposit: number,
  monthlyContributions: number[],
  annualReturnRate: number,
  PIR: number,
): InvestmentMonthRecord[] {
  const schedule: InvestmentMonthRecord[] = [];
  let balance = Math.max(0, initialDeposit);
  const monthlyReturnRate = annualReturnRate / 12 / 100;
  let yearStartBalance = balance;
  let yearContributions = 0;

  for (let monthIndex = 0; monthIndex < monthlyContributions.length; monthIndex += 1) {
    const beginningBalance = balance;
    const contribution = Math.max(0, monthlyContributions[monthIndex]);
    balance += contribution;

    const grossReturnEarned = balance * monthlyReturnRate;
    balance += grossReturnEarned;

    yearContributions += contribution;
    let PIRTaxPaid = 0;

    if ((monthIndex + 1) % 12 === 0) {
      const grossGain = balance - yearStartBalance - yearContributions;
      if (grossGain > 0) {
        PIRTaxPaid = grossGain * Math.min(PIR, 1);
        balance -= PIRTaxPaid;
      }
      yearStartBalance = balance;
      yearContributions = 0;
    }

    schedule.push({
      monthIndex,
      beginningBalance,
      monthlyContribution: contribution,
      grossReturnEarned,
      PIRTaxPaid,
      endingBalance: balance,
    });
  }

  return schedule;
}

export function runRentVsBuyProjection(inputs: RentVsBuyInputs): RentVsBuyProjectionResult {
  const horizonMonths = inputs.horizonYears * 12;
  const mortgageSchedules = amortizeMortgageTranches(inputs.mortgageTranches, horizonMonths);
  const monthlyHomeownerBaseCosts = new Array(horizonMonths).fill(
    (inputs.councilRatesAnnual + inputs.houseInsuranceAnnual) / 12,
  );

  const monthlyRentInflationRate = inputs.rentInflationRateAnnual / 12 / 100;
  const rentSchedule = new Array(horizonMonths).fill(0).map((_, monthIndex) => {
    const monthlyRentGrowth = Math.pow(1 + monthlyRentInflationRate, monthIndex);
    return (inputs.rentAnnual / 12) * monthlyRentGrowth;
  });

  const monthlyMortgagePayment = Array(horizonMonths).fill(0);
  mortgageSchedules.forEach((schedule) => {
    schedule.monthlyRecords.forEach((record) => {
      if (record.monthIndex < horizonMonths) {
        monthlyMortgagePayment[record.monthIndex] += record.monthlyPayment;
      }
    });
  });

  const propertySchedule: PropertyMonthRecord[] = [];
  const investmentContributions: number[] = [];
  let propertyValue = inputs.propertyValue;
  let totalHomeownerCost = 0;
  let totalRentCost = 0;

  for (let monthIndex = 0; monthIndex < horizonMonths; monthIndex += 1) {
    const monthlyHomeownerMortgage = monthlyMortgagePayment[monthIndex] || 0;
    propertyValue *= 1 + inputs.propertyInflationRateAnnual / 12 / 100;
    const maintenanceCost = propertyValue * (inputs.maintenanceRateAnnual / 12 / 100);
    const homeownerExpense = monthlyHomeownerMortgage + (inputs.councilRatesAnnual + inputs.houseInsuranceAnnual) / 12 + maintenanceCost;
    const rentCost = rentSchedule[monthIndex];
    const monthlySurplusIfRenting = Math.max(0, homeownerExpense - rentCost);
    const contribution = monthlySurplusIfRenting * (inputs.savingsDisciplinePercent / 100);

    propertySchedule.push({
      monthIndex,
      beginningValue: propertyValue / (1 + inputs.propertyInflationRateAnnual / 12 / 100),
      inflationRateAnnual: inputs.propertyInflationRateAnnual,
      endingValue: propertyValue,
      maintenanceCost,
      homeownerExpense,
      rentCost,
      monthlySurplusIfRenting,
    });

    investmentContributions.push(contribution);
    totalHomeownerCost += homeownerExpense;
    totalRentCost += rentCost;
  }

  const investmentSchedule = compoundInvestmentPortfolio(
    inputs.depositAmount,
    investmentContributions,
    inputs.investmentReturnAnnual,
    inputs.PIR,
  );

  return {
    horizonMonths,
    mortgageSchedules,
    investmentSchedule,
    propertySchedule,
    totalHomeownerCost,
    totalRentCost,
    finalPropertyValue: propertySchedule[horizonMonths - 1]?.endingValue ?? inputs.propertyValue,
    finalInvestmentValue: investmentSchedule[horizonMonths - 1]?.endingBalance ?? inputs.depositAmount,
  };
}

/*
Self-Validation Check - amortizeMortgageTranches():
- Edge Case Check: If deposit is 0, the mortgage amortisation still runs normally because the tranche principal is independent of deposit. If investment return is 0, mortgage amortisation remains unaffected by the investment path.
- NZ Market Truth Check: Fixed-rate tranches use fixedRateAnnual while fixed months remain, and automatically switch to floatingRateAnnual once fixedPeriodMonths are exhausted, fulfilling the fixed-rate cliff behavior.
*/

/*
Self-Validation Check - compoundPropertyValue():
- Edge Case Check: If deposit is 0, the property model still compounds only the property value and maintenance. If investment return is 0, property compounding remains unaffected.
- NZ Market Truth Check: Property inflation compounds monthly and maintenance is calculated as an annual percentage of the rising property value, not a flat fee.
*/

/*
Self-Validation Check - compoundInvestmentPortfolio():
- Edge Case Check: If deposit is 0, the investment balance begins at zero and only grows from disciplined contributions. If investment return is 0, ending balance is contributions-only and PIR tax is zero because annual gross gain is zero.
- NZ Market Truth Check: PIR tax is deducted annually from the investment gains. The monthly balance compounds throughout the year and pays tax only at year-end on the year's realized growth.
*/

/*
Self-Validation Check - runRentVsBuyProjection():
- Edge Case Check: If deposit is 0, the renter's invested balance is zero initially and grows only from surplus contributions. If investment return is 0, the rent-vs-buy comparison still produces a valid cost path with investment growth equal to contributions.
- NZ Market Truth Check: The projection uses fixed-rate cliff logic in the tranche amortisation and calculates homeowner ownership cost as repayments + rates + insurance + variable maintenance. Renter cost is rent inflated annually.
*/
