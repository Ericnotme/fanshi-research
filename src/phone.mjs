import {exactKeys,invariant} from './core.mjs';
// Plans only. No WDA client, launch method, screenshot, account UI or network.
export const MARKET_ALLOWLIST = Object.freeze({
  'apple-stocks':Object.freeze(['market-overview','symbol-chart']),
  'tradingview':Object.freeze(['market-overview','symbol-chart']),
  'yahoo-finance':Object.freeze(['market-overview','symbol-chart'])
});
export function planMarketObservation(request) {
  exactKeys(request,['app','page','symbol','publicOnly','personalDataVisible','authenticationVisible']);
  invariant(Object.hasOwn(MARKET_ALLOWLIST,request.app)&&MARKET_ALLOWLIST[request.app].includes(request.page),'Page is not allowlisted');
  invariant(typeof request.symbol==='string'&&/^[A-Z]{1,8}$/.test(request.symbol),'Only simple public symbols');
  invariant(request.publicOnly===true&&request.personalDataVisible===false&&request.authenticationVisible===false,'Stop: authentication, personal data or uncertain public context');
  return {status:'plan-only-unverified',app:request.app,page:request.page,symbol:request.symbol,deviceValidated:false,executionAvailable:false,localObservationOnly:true,stopOn:['personal-data','authentication','unknown-page','ambiguous-target'],allowedIntent:'public-market-navigation',rawScreenRetention:false,uploadAllowed:false};
}
