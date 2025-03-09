import emoji from './emoji.js';
import CReal from './creal.js';

window.CReal = CReal;

class CalculationError {
    constructor(e) {
        this.error = e;
    }
    toString() {
        return this.error+'';
    }
}

function remove_trailing_zeros(s) {
    return s.replace(/\.?0*$/, '');
}

function choice(list) {
  const n = Math.floor(Math.random()*list.length);
  return list[n];
}

let idacc = 0;
class Item {
  constructor() {
    this.id = idacc++;
    this.label = '';
  }

  toSerialisedString() {
      return this.toString();
  }
}

function nice_number(n, max_length = 10) {
    if(n instanceof CalculationError) {
        return n+'';
    }
    try {
        const sci = n.toStringFloatRep(max_length,10,-max_length*2);
        if(sci.mantissa == '0') {
            return '0';
        }
        if(sci.exponent < max_length && sci.exponent > -(max_length-2)/2) {
            let s;
            if(sci.exponent > 0) {
                s = n.toString(max_length - sci.exponent - 1);
            } else {
                s = n.toString(max_length - 2);
            }
            return s.replace(/\.(.*[1-9])?0+$/,'.$1').replace(/\.$/,'');
        } else {
            const mantissa = `${sci.mantissa.slice(0,1)}.${sci.mantissa.slice(1)}`;
            const sign = sci.sign == -1 ? '-' : '';
            const exponent = (sci.exponent-1)+'';
            const times = 'E';//'×10^';
            const l = sign.length +times.length + exponent.length;
            return `${sign}${mantissa.slice(0,max_length-l)}${times}${exponent}`;
        }
    } catch(e) {
        return (new CalculationError(e))+'';
    }
} 

const used_labels = {};

class NumberItem extends Item {
    constructor(value) {
        super();
        this.value = value;
    }

    copy() {
        if(!this.label) {
            const available_emoji = emoji.filter(x=>!(x in used_labels));
            const label = choice(available_emoji);
            this.label = label;
            used_labels[label] = true;
        }
        return this;
    }

    toString() {
        let s = nice_number(this.value);
        if(this.label) {
            s += ',$'+this.label;
        }
        return s;
    }

    toSerialisedString() {
        let s = remove_trailing_zeros(this.value.toString());
        if(this.label) {
            s += ',$'+this.label;
        }
        return s;
    }

    toNotation() {
        return (this.label || nice_number(this.value))+'';
    }
}
NumberItem.prototype.kind = 'number';

class ConstantItem extends NumberItem {
  constructor(constant) {
    super();
    this.constant = constant;
    this.value = constant.value;
    this.label = constant.label;
  }
  copy() {
    return this;
  }
  toString() {
    return this.constant.label;
  }
  toNotation() {
    return this.constant.label;
  }
}
ConstantItem.prototype.kind = 'number';

class Op extends Item {
  constructor(op,args) {
    super();
    this.op = op;
    this.args = args;
    this.show_more_digits = false;
  }
  copy() {
    return new Op(this.op,this.args.map(x=>x.copy()));
  }
  get value() {
    try {
        return fns[this.op.op](...this.args.map(x=>x.value));
    } catch(e) {
        console.error(e);
        return new CalculationError(e);
    }
  }
  toString() {
    return this.value.toString();

    const args = this.args.join(',');
    let op = this.op.op;
    if(this.op.chain) {
      for(let i=this.op.arity;i<this.args.length;i++) {
        op += ','+this.op.op;
      }
    }
    let s = args+','+op;
    if(this.label) {
      s += ',$'+this.label;
    }
    return s;
  }

  toSerialisedString() {
    const args = this.args.map(arg => arg.toSerialisedString()).join(',');
    let op = this.op.op;
    if(this.op.chain) {
      for(let i=this.op.arity;i<this.args.length;i++) {
        op += ','+this.op.op;
      }
    }
    let s = args+','+op;
    if(this.label) {
      s += ',$'+this.label;
    }
    return s;
  }

  toNotation() {
    if(this.label) {
      return this.label;
    }
    if(this.op.toNotation) {
        return this.op.toNotation(this.args);
    } else if(this.op.precedence) {
      const args = this.args.map(arg=>{
        const argn = arg.toNotation();
        if(!arg.label && arg instanceof Op && (arg.op.precedence<this.op.precedence || (arg.op.precedence==this.op.precedence && arg.op.symbol!=this.op.symbol))) {
          return `(${argn})`;
        } else {
          return argn;
        }
      });
      return args.join(`\u200B${this.op.symbol}\u200B`);
    } else {
      return `${this.op.symbol || this.op.op}\u200B(${this.args.map(x=>x.toNotation()).join(', ')})`;
    }
  }
}
Op.prototype.kind = 'op';

Vue.component('touch-button', {
    props: ['kind'],
    methods: {
        click: function(e) {
            this.$emit('click',e);
            e.preventDefault();
            this.$el.focus();
            if(!this.$el.disabled) {
                if(window.navigator.vibrate) {
                    window.navigator.vibrate([30]);
                }
            }
        }
    },
    template: `<button :data-kind="kind" @click="click"><slot></slot></button>`
})

Vue.component('item-number', {
    props: ['value'],
    computed: {
        has_error: function() {
            if(this.value instanceof CalculationError) {
                return true;
            }

            try {
                this.value.toString();
                return false;
            } catch(e) {
                return true;
            }
        }
    },
    methods: {
      display: function() {
        const value = this.value;
        return nice_number(this.value);
      }
    },
    template: `
        <span data-kind="number" class="number" :class="{error: has_error}">{{display()}}</span>
    `,
})

Vue.component('item-op', {
    props: ['op','args','value','depth','path','selection_path', 'value_collapsed'],
    data: function() {
        return {
            args_collapsed: this.depth > 0,
        }
    },
    watch: {
      selection_path: function(newPath,oldPath) {
        if(JSON.stringify(newPath)==JSON.stringify(oldPath)) {
            return;
        }
        if((this.selection_path || []).length>0) {
          this.args_collapsed = false;
        } else {
          this.args_collapsed = this.depth>0;
        }
      }
    },
    methods: {
        click_item: function(path) {
            this.$emit('click-item',path)
        },
        collapse_args: function() {
            this.args_collapsed = !this.args_collapsed;
        },
        display: function() {
            return nice_number(this.value);
        },
    },
    template: `
        <div data-kind="op" class="op" :class="{'args-collapsed': args_collapsed, 'value-collapsed': value_collapsed}">
            <item-stack v-if="!args_collapsed" :items="args" :depth="depth+1" :path="path" :selection_path="selection_path" @click-item="click_item"></item-stack>
            <div class="symbol" v-if="!args_collapsed" @click="collapse_args">{{op.label}}</div>
            <div class="show-collapsed" v-if="args_collapsed" @click="collapse_args">...</div>
            <op-result :value="value" :value_collapsed="value_collapsed"></op-result>
        </div>
    `
})

Vue.component('op-result', {
    props: ['value', 'value_collapsed'],

    data: function() {
        return {
            digits_shown : 500,
        }
    },

    computed: {
      more_digits: function() {
          if(this.value instanceof CalculationError) {
              return {whole: this.value+'', frac: ''};
          }
          const s = this.value.toString(this.digits_shown);
          const m = s.match(/(-?\d+)(?:\.(\d+))?/);
          const [whole, frac] = m.slice(1);
          const space = '     '.slice(0,(5 - (whole.length%5))%5);
          const first = whole.slice(0,whole.length % 5);
          const rest = whole.slice(whole.length % 5).replace(/(.{5})/g,' $1').trim();
          let spaced_whole = space + first + (first && rest ? ' ' : '') + rest;
          return {whole: spaced_whole, frac: frac.replace(/(.{5})/g,'$1 ').trim()};
      }
    },

    methods: {
        tap: function() {
            if(window.getSelection().type == 'Range') {
                return;
            }
            this.$emit('collapse_values')
        },
        scroll_more_digits: function(e) {
            const p = e.target;
            if(p.scrollTop > p.scrollHeight - 100) {
                this.digits_shown += 500;
            }
        },
    },
    template: `
        <div class="result" @click="tap" tabindex="" role="group">
            <item-number v-if="value_collapsed" :value="value"></item-number>
            <pre class="more-digits" v-if="!value_collapsed" @scroll="scroll_more_digits"><span class="whole">{{more_digits.whole}}</span><span v-if="more_digits.frac">.</span><span class="frac" v-if="more_digits.frac">{{more_digits.frac}}</span></pre>
        </div>
    `
});

Vue.component('standalone-op-result', {
    props: ['value'],
    data: function() {
        return {
            value_collapsed: true
        }
    },
    methods: {
        collapse_values: function() {
            this.value_collapsed = !this.value_collapsed;
        }
    },
    template: `
        <op-result :value="value" :value_collapsed="value_collapsed" @collapse_values="collapse_values"></op-result>
    `
});

Vue.component('stack-item', {
    props: ['item','depth','path','selection_path','selected'],
    methods: {
        click_item: function(path) {
            this.$emit('click-item',path);
        },
        click: function(e) {
            let t = e.target;
            while(t && t!=this.$el) {
                if(t.classList.contains('item-container')) {
                    return;
                }
                t = t.parentElement;
            }
            this.$emit('click-item',this.path);
        },
        collapse_values: function() {
          this.item.show_more_digits = !this.item.show_more_digits && this.selected;
        }
    },
    mounted: function() {
        this.$el.scrollIntoView && this.$el.scrollIntoView({block: 'center'});
    },
    computed: {
        top: function() {
            return this.path.length<=1;
        },
        show_notation: function() {
            return this.top && this.item.kind=='op';
        },
        label_length: function() {
            return (this.label || '').length;
        }
    },
    watch: {
        selected: function() {
            if(this.selected) {
                this.$el.scrollIntoView && this.$el.scrollIntoView({block: 'center'});
            }
        }
    },
    template: `
        <div class="item-container">
            <li class="item" :class="[selected ? 'selected' : '',item.kind]" :data-kind="item.kind" @click="click">
                <input :placeholder="item.toNotation()" v-if="selected && !item.constant" class="edit-name" v-model="item.label" autocapitalize="off"></input>
                <span v-if="item.constant || !selected && item.label" class="label">{{item.label}}</span>
                <item-number v-if="item.kind=='number'" :value="item.value"></item-number>
                <item-op 
                    v-if="item.kind=='op'" 
                    :op="item.op" 
                    :args="item.args" 
                    :value="item.value" 
                    :depth="depth" 
                    :path="path" 
                    :selection_path="selection_path" 
                    :value_collapsed="!item.show_more_digits" 
                    @click-item="click_item" 
                    @collapse_values="collapse_values"
                ></item-op>
            </li>
            <span class="notation" v-if="show_notation">{{item.toNotation()}}</span>
        </div>
    `
});

Vue.component('item-stack', {
    props: ['items','depth','path','selection_path'],
    methods: {
        click_item: function(path) {
            this.$emit('click-item',path);
        }
    },
    computed: {
        hue: function() {
            return 1.618*360*(this.depth+1)
        },
        row: function() {
            return this.selection_path.length ? this.selection_path[0] : -1;
        },
        selected: function() {
            return this.selection_path.length==1;
        }
    },
    template: `
<div class="stack">
    <transition-group name="stack" tag="ol" class="stack-items">
            <stack-item 
                v-for="(item,index) in items" 
                :key="item.id" 
                :item="item" 
                :depth="depth" 
                :path="path.concat([index])" 
                :selection_path="selection_path.length && selection_path[0]==index ? selection_path.slice(1) : []" 
                :selected="selected && index==row" 
                @click-item="click_item"
            >
            </stack-item>
    </transition-group>
</div>
    `
})

Vue.component('named-item-editor', {
    props: ['item'],
    data: function() {
        return {
            string_value: remove_trailing_zeros(this.item.value.toString())
        }
    },
    watch: {
        string_value: function(e) {
            this.item.value = CReal.valueOf(this.string_value);
        }
    },
    template: `
      <input type="number" v-model="string_value">
    `
});

Vue.directive('focus', {
    inserted: el => el.focus()
});


function factorial(n) {
    n = n.abs().BigIntValue();
    let t = 1n;
    while(n>=1n) {
        t *= n;
        n -= 1n;
    }
    return CReal.valueOf(t);
}
function combinations(n,r) {
    return factorial(n).divide(factorial(r).multiply(factorial(n.subtract(r))));
}
function permutations(n,r) {
    return factorial(n).divide(factorial(n.subtract(r)));
}

function sum(...args) {
  let t = CReal.ZERO;
  for(let n of args) {
    t = t.add(n);
  }
  return t;
}
function product(...args) {
  let t = CReal.ONE;
  for(let n of args) {
    t = t.multiply(n);
  }
  return t;
}

function mean(...args) {
  return sum(...args).divide(CReal.valueOf(args.length));
}

function bracket_postfix(symbol) {
    return function(args) {
        const [arg] = args;
        const x = arg.toNotation();
        return arg instanceof NumberItem ? `${x}${symbol}` : `(${x})${symbol}`;
    }
}

const ops = [
    {op: 'mul', 'label': '×', 'key': '*', arity: 2, fn: product, screen: 'main', chain: true, precedence: 2, symbol: '×'},
    {op: 'div', 'label': '÷', 'key': '/', arity: 2, fn: (a,b) => a.divide(b), screen: 'main', precedence: 2, symbol: '÷'},
    {op: 'add', 'label': '+', 'key': '+', arity: 2, fn: sum, screen: 'main', chain: true, precedence: 1, symbol: '+'},
    {op: 'sub', 'label': '-', 'key': '-', arity: 2, fn: (a,b) => a.subtract(b), screen: 'main', precedence: 1, symbol: '-'},
    {op: 'sin', 'label': 'Sin', 'key': 's', arity: 1, fn: a => a.sin(), area: 'num-7', screen: 'trig'},
    {op: 'cos', 'label': 'Cos', 'key': 'c', arity: 1, fn: a => a.cos(), area: 'num-8', screen: 'trig'},
    {op: 'tan', 'label': 'Tan', 'key': 't', arity: 1, fn: a => a.sin().divide(a.cos()), area: 'num-9', screen: 'trig'},
    {op: 'arcsin', 'label': 'Sin⁻¹', 'key': 'S', arity: 1, fn: a => a.asin(), area: 'num-4', screen: 'trig'},
    {op: 'arccos', 'label': 'Cos⁻¹', 'key': 'C', arity: 1, fn: a => a.acos(), area: 'num-5', screen: 'trig'},
    {op: 'arctan', 'label': 'Tan⁻¹', 'key': 'T', arity: 1, fn: a => a.divide(a.multiply(a).add(CReal.ONE).sqrt()).asin(), area: 'num-6', screen: 'trig'},
    {op: 'square', 'label': 'x²', 'key': '^', arity: 1, fn: x => x.multiply(x), area: 'num-0', screen: 'trig', toNotation: bracket_postfix('²'), precedence: 3},
    {op: 'root', 'label': '√', 'key': 'r', arity: 1, fn: x => x.sqrt(), area: 'sign', screen: 'trig', symbol: '√'},
    {op: 'pow', 'label': 'xʸ', 'key': 'p', arity: 2, fn: (a,b) => a.pow(b), area: 'dot', screen: 'trig', precedence: '3', symbol: '^'},
    {op: 'ln', 'label': 'ln', 'key': 'l', arity: 1, fn: a => a.ln(), area: 'op-mul', screen: 'trig'},
    {op: 'log', 'label': 'log', 'key': 'L', arity: 1, fn: a => a.ln().divide(CReal.valueOf(10).ln()), area: 'op-div', screen: 'trig'},
    {op: 'exp', 'label': 'eˣ', 'key': 'e', arity: 1, fn: a => a.exp(), area: 'op-add', screen: 'trig'},
    {op: 'exp10', 'label': '10ˣ', 'key': 'E', arity: 1, fn: a => a.multiply(CReal.valueOf(10).ln()).exp(), area: 'op-sub', screen: 'trig'},
    {op: 'factorial', 'label': 'x!', 'key': '!', arity: 1, fn: factorial, area: 'num-3', screen: 'trig', toNotation: bracket_postfix('!')},
    {op: 'combinations', 'label': 'ⁿCᵣ', 'key': '', arity: 2, fn: combinations, area: 'constant-pi', screen: 'trig'},
    {op: 'permutations', 'label': 'ⁿPᵣ', 'key': '', arity: 2, fn: permutations, area: 'constant-e', screen: 'trig'},
    {op: 'mean', 'label': 'Mean', 'key': 'm', arity: Infinity, fn: mean, area: 'num-1', screen: 'trig'},
    {op: 'mod', 'label': 'Mod', 'key': '%', arity: 2, fn: (a,b) => CReal.valueOf(a.BigIntValue() % b.BigIntValue()), area: 'num-2', screen: 'trig'},
];
const op_dict = Object.fromEntries(ops.map(op => [op.op, op]));

const constants = [
    {name: 'pi', value: CReal.PI, label: 'π', screen: 'main', key: 'P'},
    {name: 'e', value: CReal.E, label: 'e', screen: 'main'},
];

const fns = {};
ops.forEach(op => {
    fns[op.op] = op.fn
});

const stack = [];
const playback_expression = window.location.hash;

class CustomOp {
  constructor(n,position) {
    this.op = `custom-${n}`;
    this.position = position;
    this.code = 'return a;';
    this.kind = 'unary';
    this.symbol = '';
    this.valid = false;
    this.fn = a => a;
  }
  
  op_object() {
    const symbol = this.symbol;
    const arity = {constant: 0, unary: 1, binary: 2}[this.kind];
    return {
      op: this.op, 
      'label': symbol, 
      arity: arity,
      fn: () => this.fn,
      screen: 'custom',
      symbol: symbol
    };  
  }
}

class VariableAssignment {
    constructor(name, n) {
        this.name = name;
        this.n = n;
    }

    toString() {
        return ''.padStart(this.n, ':') + this.name;
    }
}

class OpReference {
    constructor(name) {
        this.name = name;
    }

    toString() {
        return this.name;
    }
}

const token_types = [
    {regex: /^-?\d+(\.\d+)?/, fn: ([digits]) => new NumberItem(CReal.valueOf(digits))},

    {regex: /^(:+)(\S+|"[^\"]+")/, fn: ([_,colons,name]) => new VariableAssignment(name, colons.length)},

    {regex: /\S+|"[^\"]+"/, fn: ([name]) => new OpReference(name)}
];

function parse(str) {
    let i = 0;
    const tokens = [];
    while(i<str.length) {
        let s = str.slice(i);
        const [space] = s.match(/^\s*/);
        i += space.length;
        s = str.slice(i);

        for(let {regex,fn} of token_types) {
            const m = regex.exec(s);
            if(m) {
                const token = fn(m);
                tokens.push(token);
                i += m[0].length;
                break;
            }
        }
    }
    return tokens;
}
window.parse = parse;

function run(tokens) {
    let i = 0;
    let steps = 0;
    while(i<tokens.length && steps < 1e4) {
        steps++;

        const token = tokens[i];
        console.log(tokens.join(' '));
        console.log(''.padStart(tokens.slice(0,i).join(' ').length,' ')+'^');
        if(token instanceof VariableAssignment) {
            console.log(`define ${token.name}`);
            tokens.splice(i,1);
            const values = tokens.splice(i - token.n, token.n);
            tokens = tokens.flatMap(t => {
                if(t instanceof OpReference && t.name == token.name) {
                    return values.slice();
                } else {
                    return [t];
                }
            });
            i = 0;
        } else if(token instanceof OpReference) {
            const op = op_dict[token.name];
            console.log('op',op);
            if(op) {
                if(i < op.arity) {
                    console.log(`pass over because not enough args ${token}`);
                    i += 1;
                    continue;
                }
                const args = tokens.slice(i-op.arity, i);
                console.log('args',i, op.arity, args.slice(), tokens.slice());
                if(args.some(arg => !(arg instanceof Item))) {
                    i += 1;
                    console.log('not all items');
                    continue;
                }
                console.log('go');
                const value = new Op(op, args);
                tokens.splice(i-op.arity,op.arity + 1, value);
                i -= op.arity;
            } else {
                console.log(`pass over undefined ${token}`);
                i += 1;
            }
        } else {
            console.log(`pass over item ${token}`);
            i += 1;
        }
    }
    return tokens;
}

const input_area = document.getElementById('input');
const output_area = document.querySelector('output[for="input"]');

function update() {
    console.clear();
    const program = input_area.value;
    const tokens = parse(program);
    console.log(tokens);
    const output = run(tokens);
    console.log(output.join(' '));
    output_area.textContent = output.join(' ');
}

input_area.addEventListener('input', update);

update();
