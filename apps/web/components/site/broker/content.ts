/** Text for the broker website (shown only in preview, or live after registration). */
export const OFFERINGS: Record<string, { title: string; text: string; mark: 'stocks' | 'fo' | 'commodity' | 'charts' }> = {
  STOCKS: { title: 'Stocks', text: 'Buy and sell shares listed on the exchanges.', mark: 'stocks' },
  FO: { title: 'Futures & options', text: 'Hedge or trade with derivatives, with margins shown before you place an order.', mark: 'fo' },
  COMMODITY: { title: 'Commodities', text: 'Gold, Silver, Crude Oil, Natural Gas and base metals on MCX.', mark: 'commodity' },
  CURRENCY: { title: 'Currency', text: 'Currency futures and options on the exchanges.', mark: 'charts' },
  IPO: { title: 'IPO', text: 'Apply for new issues with UPI.', mark: 'stocks' },
  MUTUAL_FUNDS: { title: 'Mutual funds', text: 'Invest in direct mutual funds.', mark: 'charts' },
};
export const ACCOUNT_TYPES: Record<string, [string, string]> = {
  INDIVIDUAL: ['Individual account', 'For your own trading and investing.'],
  HUF: ['HUF account', 'For a Hindu Undivided Family.'],
  NRI: ['NRI account', 'For Indians living abroad.'],
  MINOR: ['Minor account', 'Opened and run by a guardian for a child.'],
  CORPORATE: ['Corporate / LLP / partnership', 'For businesses and firms.'],
};
export const BROKER_FAQ: [string, string][] = [
  ['What do I need to open an account?', 'Your PAN, Aadhaar linked to your mobile number, a bank account in your name and a signature. The whole process is online.'],
  ['How long does account opening take?', 'Once your documents are verified and you e-sign, the account is usually ready within a few working days.'],
  ['Are there charges to open an account?', 'Account opening and brokerage charges are listed on this page and on the Pricing page.'],
  ['Can I practise before trading with real money?', 'Yes. Every customer gets the practice account with virtual money, and can join our courses.'],
  ['How do I raise a complaint?', 'Write to the grievance email at the bottom of this page. If it is not resolved, you can escalate on SEBI SCORES or the ODR portal.'],
];
