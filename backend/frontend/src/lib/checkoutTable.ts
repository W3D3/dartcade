// Double-out checkouts from 170 down to 41: the routes the pros take, after Guido Wessendorf's
// table (https://www.uni-muenster.de/IT.GuidoWessendorf/checkout.html, 8 Jan 2021), itself based
// on Ken Berman's "How the Pros Do It". Scores missing here (169, 168, 166, 165, 163, 162, 159)
// can't be finished in three darts.
//
// routes: the table's first route, then its alternative (often ending on another double);
// twoDarts: what to throw with only two darts left, where that differs. "16/8" in the table
// (aim between the two fields) is written as its first field.

export type CheckoutEntry = { routes: string[][]; twoDarts?: string[] }

export const CHECKOUTS: Readonly<Record<number, CheckoutEntry>> = {
  170: { routes: [['T20', 'T20', 'Bull']] },
  167: { routes: [['T20', 'T19', 'Bull']] },
  164: {
    routes: [
      ['T20', 'T18', 'Bull'],
      ['T19', 'T19', 'Bull'],
    ],
  },
  161: { routes: [['T20', 'T17', 'Bull']] },
  160: { routes: [['T20', 'T20', 'D20']] },
  158: { routes: [['T20', 'T20', 'D19']] },
  157: { routes: [['T20', 'T19', 'D20']] },
  156: { routes: [['T20', 'T20', 'D18']] },
  155: { routes: [['T20', 'T19', 'D19']] },
  154: { routes: [['T20', 'T18', 'D20']] },
  153: { routes: [['T20', 'T19', 'D18']] },
  152: { routes: [['T20', 'T20', 'D16']] },
  151: {
    routes: [
      ['T20', 'T17', 'D20'],
      ['T19', 'T18', 'D20'],
    ],
  },
  150: {
    routes: [
      ['T20', 'T18', 'D18'],
      ['T19', 'T19', 'D18'],
    ],
  },
  149: { routes: [['T20', 'T19', 'D16']] },
  148: {
    routes: [
      ['T20', 'T20', 'D14'],
      ['T19', 'T17', 'D20'],
    ],
  },
  147: {
    routes: [
      ['T20', 'T17', 'D18'],
      ['T19', 'T18', 'D18'],
    ],
  },
  146: {
    routes: [
      ['T20', 'T18', 'D16'],
      ['T19', 'T19', 'D16'],
    ],
  },
  145: { routes: [['T20', 'T19', 'D14']] },
  144: { routes: [['T20', 'T20', 'D12']] },
  143: {
    routes: [
      ['T20', 'T17', 'D16'],
      ['T19', 'T18', 'D16'],
    ],
  },
  142: {
    routes: [
      ['T20', 'T14', 'D20'],
      ['T19', 'T19', 'D14'],
    ],
  },
  141: { routes: [['T20', 'T19', 'D12']] },
  140: { routes: [['T20', 'T20', 'D10']] },
  139: {
    routes: [
      ['T20', 'T13', 'D20'],
      ['T20', 'T19', 'D11'],
    ],
  },
  138: {
    routes: [
      ['T20', 'T18', 'D12'],
      ['T19', 'T19', 'D12'],
    ],
  },
  137: { routes: [['T20', 'T19', 'D10']] },
  136: { routes: [['T20', 'T20', 'D8']] },
  135: {
    routes: [
      ['T20', 'T17', 'D12'],
      ['25', 'T20', 'Bull'],
    ],
  },
  134: { routes: [['T20', 'T16', 'D13']] },
  133: { routes: [['T20', 'T19', 'D8']] },
  132: {
    routes: [
      ['T20', 'T16', 'D12'],
      ['25', 'T19', 'Bull'],
    ],
  },
  131: {
    routes: [
      ['T19', 'T14', 'D16'],
      ['T20', 'T13', 'D16'],
    ],
  },
  130: { routes: [['T20', 'T20', 'D5']] },
  129: {
    routes: [
      ['T19', 'T16', 'D12'],
      ['T20', 'T19', 'D6'],
    ],
  },
  128: {
    routes: [
      ['T18', 'T14', 'D16'],
      ['T20', 'T18', 'D7'],
    ],
  },
  127: { routes: [['T20', 'T17', 'D8']] },
  126: { routes: [['T19', 'T19', 'D6']] },
  125: {
    routes: [
      ['T18', 'T19', 'D7'],
      ['T20', 'T15', 'D10'],
    ],
  },
  124: { routes: [['T20', 'T14', 'D11']] },
  123: { routes: [['T19', 'T16', 'D9']] },
  122: { routes: [['T18', 'T18', 'D7']] },
  121: {
    routes: [
      ['T20', 'T11', 'D14'],
      ['T17', 'T20', 'D5'],
    ],
  },
  120: { routes: [['T20', 'S20', 'D20']] },
  119: { routes: [['T19', 'T12', 'D13']] },
  118: { routes: [['T20', 'S18', 'D20']] },
  117: {
    routes: [
      ['T19', 'S20', 'D20'],
      ['T20', 'S17', 'D20'],
    ],
  },
  116: {
    routes: [
      ['T19', 'S19', 'D20'],
      ['T20', 'S16', 'D20'],
    ],
  },
  115: {
    routes: [
      ['T20', 'S15', 'D20'],
      ['T19', 'S18', 'D20'],
    ],
  },
  114: {
    routes: [
      ['T19', 'S17', 'D20'],
      ['T20', 'S14', 'D20'],
    ],
  },
  113: { routes: [['T19', 'S16', 'D20']] },
  112: { routes: [['T20', 'T12', 'D8']] },
  111: {
    routes: [
      ['T19', 'S14', 'D20'],
      ['T20', 'S11', 'D20'],
    ],
  },
  110: { routes: [['T20', 'T10', 'D10']], twoDarts: ['T20', 'Bull'] },
  109: { routes: [['T20', 'S9', 'D20']] },
  108: { routes: [['T20', 'S16', 'D16']] },
  107: { routes: [['T19', 'T10', 'D10']], twoDarts: ['T19', 'Bull'] },
  106: { routes: [['T20', 'T10', 'D8']] },
  105: { routes: [['T20', 'S13', 'D16']] },
  104: { routes: [['T19', 'S15', 'D16']], twoDarts: ['T18', 'Bull'] },
  103: { routes: [['T19', 'S6', 'D20']] },
  102: { routes: [['T20', 'S10', 'D16']] },
  101: { routes: [['T20', 'S9', 'D16']], twoDarts: ['T17', 'Bull'] },
  100: { routes: [['T20', 'D20']] },
  99: { routes: [['T19', 'S10', 'D16']] },
  98: { routes: [['T20', 'D19']] },
  97: { routes: [['T19', 'D20']] },
  96: { routes: [['T20', 'D18']] },
  95: {
    routes: [
      ['T19', 'D19'],
      ['25', 'T20', 'D5'],
    ],
  },
  94: {
    routes: [
      ['T18', 'D20'],
      ['25', 'T19', 'D6'],
    ],
  },
  93: {
    routes: [
      ['T19', 'D18'],
      ['25', 'T18', 'D7'],
    ],
  },
  92: {
    routes: [
      ['T20', 'D16'],
      ['25', 'T17', 'D8'],
    ],
  },
  91: {
    routes: [
      ['T17', 'D20'],
      ['25', 'T16', 'D9'],
    ],
  },
  90: { routes: [['T20', 'D15']], twoDarts: ['T18', 'D18'] },
  89: { routes: [['T19', 'D16']] },
  88: { routes: [['T20', 'D14']] },
  87: { routes: [['T17', 'D18']] },
  86: { routes: [['T18', 'D16']] },
  85: {
    routes: [
      ['T15', 'D20'],
      ['T19', 'D14'],
    ],
  },
  84: { routes: [['T20', 'D12']] },
  83: { routes: [['T17', 'D16']] },
  82: {
    routes: [
      ['Bull', 'D16'],
      ['T14', 'D20'],
    ],
  },
  81: {
    routes: [
      ['T19', 'D12'],
      ['T15', 'D18'],
    ],
  },
  80: {
    routes: [
      ['T20', 'D10'],
      ['D20', 'D20'],
    ],
  },
  79: {
    routes: [
      ['T19', 'D11'],
      ['T13', 'D20'],
    ],
  },
  78: { routes: [['T18', 'D12']] },
  77: { routes: [['T19', 'D10']] },
  76: {
    routes: [
      ['T20', 'D8'],
      ['T16', 'D14'],
    ],
  },
  75: { routes: [['T17', 'D12']] },
  74: { routes: [['T14', 'D16']] },
  73: { routes: [['T19', 'D8']] },
  72: {
    routes: [
      ['T16', 'D12'],
      ['T20', 'D6'],
    ],
  },
  71: { routes: [['T13', 'D16']] },
  70: { routes: [['T18', 'D8']], twoDarts: ['T20', 'D5'] },
  69: { routes: [['T19', 'D6']], twoDarts: ['T19', 'D6'] },
  68: {
    routes: [
      ['T20', 'D4'],
      ['T16', 'D10'],
    ],
    twoDarts: ['T18', 'D7'],
  },
  67: { routes: [['T9', 'D20']], twoDarts: ['T17', 'D8'] },
  66: {
    routes: [
      ['T10', 'D18'],
      ['T18', 'D6'],
    ],
    twoDarts: ['T16', 'D9'],
  },
  65: {
    routes: [
      ['T11', 'D16'],
      ['T19', 'D4'],
    ],
    twoDarts: ['T15', 'D10'],
  },
  64: { routes: [['T16', 'D8']], twoDarts: ['T14', 'D11'] },
  63: {
    routes: [
      ['T13', 'D12'],
      ['T17', 'D6'],
    ],
    twoDarts: ['T13', 'D12'],
  },
  62: { routes: [['T10', 'D16']], twoDarts: ['T12', 'D13'] },
  61: {
    routes: [
      ['T15', 'D8'],
      ['T7', 'D20'],
    ],
    twoDarts: ['T11', 'D14'],
  },
  60: { routes: [['S20', 'D20']] },
  59: { routes: [['S19', 'D20']] },
  58: { routes: [['S18', 'D20']] },
  57: { routes: [['S17', 'D20']] },
  56: { routes: [['T16', 'D4']] },
  55: { routes: [['S15', 'D20']] },
  54: { routes: [['S14', 'D20']] },
  53: { routes: [['S13', 'D20']] },
  52: {
    routes: [
      ['S12', 'D20'],
      ['S20', 'D16'],
    ],
  },
  51: {
    routes: [
      ['S11', 'D20'],
      ['S19', 'D16'],
    ],
  },
  50: {
    routes: [
      ['S10', 'D20'],
      ['S18', 'D16'],
    ],
  },
  49: {
    routes: [
      ['S9', 'D20'],
      ['S17', 'D16'],
    ],
  },
  48: { routes: [['S16', 'D16']] },
  47: {
    routes: [
      ['S7', 'D20'],
      ['S15', 'D16'],
    ],
  },
  46: { routes: [['S6', 'D20']] },
  45: {
    routes: [
      ['S13', 'D16'],
      ['S19', 'D13'],
    ],
  },
  44: {
    routes: [
      ['S12', 'D16'],
      ['S4', 'D20'],
    ],
  },
  43: {
    routes: [
      ['S3', 'D20'],
      ['S11', 'D16'],
    ],
  },
  42: { routes: [['S10', 'D16']] },
  41: { routes: [['S9', 'D16']] },
}
