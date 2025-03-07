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

const custom_op_positions = "num-8 num-9 constant-pi constant-e num-4 num-5 num-6 op-mul op-div num-1 num-2 num-3 op-add op-sub num-0 sign dot push push".split(' ');

const custom_ops = [];
custom_op_positions.forEach((location,i) => {
  custom_ops.push(new CustomOp(i,location));
})
const app = window.app = new Vue({
  el: '#app',
  data: {
    mode: 'calculator',
    row: -1,
    current_stack: stack,
    parent_stacks: [],
    new_input: true,
    ops: ops,
    input: '',
    stack: stack,
    constants: constants,
    typed_item_name: '',
    
    custom_ops: custom_ops,
    edit_op: custom_ops[0],
    editor_warning: ''
  },
  computed: {
      path: function() {
          const p = this.parent_stacks.map(s=>s[1]);
          p.push(this.row);
          return p;
      },
      selection: function() {
          return this.row>=0 && this.row<this.current_stack.length && this.current_stack[this.row];
      },
      can_copy: function() {
          return this.can_pop;
      },
      can_undo: function() {
          return this.selection && this.selection.kind=='op' && this.top_stack;
      },
      can_pop: function() {
          if(!this.selection) {
              return false;
          }
          if(this.top_stack) {
              return true;
          }
          const [parent_stack, parent_row] = this.parent_stacks[this.parent_stacks.length-1];
          const parent_item = parent_stack[parent_row];
          if(parent_item.kind == 'op' && parent_item.op.chain && this.current_stack.length>1) {
              return true;
          }
          return false;
      },
      can_swap: function() {
          return this.row>0;
      },
      title: function() {
          const main = "CLP's Nice Calculator";
          if(this.selection) {
              return `${nice_number(this.selection.value)} - ${main}`;
          } else {
              return main;
          }
      },
      top_stack: function() {
          return this.parent_stacks.length==0;
      },
      serialised: function() {
          return this.stack.map(item => item.toSerialisedString()).join(',');
      },
    
      editor_signature: function() {
        switch(this.edit_op.kind) {
          case 'unary':
            return '(a) =>';
          case 'binary':
            return '(a,b) =>';
          case 'constant':
            return '() =>';
        }
      },
    
      editor_fn: function() {
        let fn;
        let code = this.edit_op.code.trim();
        try {
          switch(this.edit_op.kind) {
            case 'unary':
              fn = new Function('a',code);
              break;
            case 'binary':
              fn = new Function('a','b',code);
              break;
            case 'constant':
              fn = new Function(code);
              break;
          }
          this.editor_warning = '';
        } catch(e) {
          this.editor_warning = e.message;
          return null;
        }
        return fn;
      },
    
      named_items: function() {
        let look = this.stack.slice();
        const items = new Set();
        while(look.length) {
          const item = look.pop();
          if(item.label) {
            items.add(item);
          }
          if(item.args) {
            look = look.concat(item.args);
          }
        }
        return Array.from(items);
      },

      sorted_named_items: function() {
          const kinds = ['number', 'op'];
          return this.named_items.toSorted((a,b) => {
              const ai = kinds.indexOf(a.kind);
              const bi = kinds.indexOf(b.kind);
              return ai != bi ? ai-bi : a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
          });
      },

      searched_named_items: function() {
          return this.sorted_named_items.filter(item => item.label.startsWith(this.typed_item_name));
      },

      matching_named_item: function() {
          if(this.mode != 'pick_named_item') {
              return;
          }
          if(this.searched_named_items.length != 1) {
              return;
          }
          return this.searched_named_items[0];
      },

      has_custom_ops: function() {
          return this.custom_ops.some(o => o.valid);
      }
  },
  watch: {
      selection: function() {
          const item = this.current_stack[this.row];
          if(!item) {
              return;
          }
          if(item.kind=='number') {
            this.new_input = true;
            this.input = nice_number(item.value);
          }
      },
      title: function() {
          document.title = this.title;
      },
      serialised: function() {
          window.location.hash = this.serialised;
      },
    
      editor_fn: function() {
        if(!this.edit_op.symbol) {
          this.edit_op.valid = false;
          return;
        }

        this.edit_op.valid = this.editor_fn !== null;

        const fn = this.editor_fn;

        this.edit_op.fn = (a,b) => { 
            const r = fn(a,b); 
            if(r===undefined) {
                throw(new Error("This function didn't return anything."));
            }; 
            return r;
        };

        fns[this.edit_op.op] = this.edit_op.fn;
      },

      matching_named_item: function() {
          if(!this.matching_named_item) {
              return;
          }
          const item = this.matching_named_item;
          this.add_named_item(item);
          this.mode = 'calculator';
      }
  },
  methods: {
    can_op: function(op) {
        if(op.arity===Infinity) {
          return this.current_stack.length>0;
        }
        return (this.row>=op.arity-1 || (this.row==op.arity-2 && !this.new_input)) && this.top_stack;
    },
    can_custom: function(custom) {
      if(custom.kind=='constant') {
        return true;
      } else {
        return this.can_op(custom.op_object());
      }
    },
    digit: function(n) {
        if(this.new_input) {
            this.input = '';
        }
        this.new_input = false;
        this.input += n;
    },
    dot: function() {
        if(this.new_input) {
            this.input = '0';
        }
        if(this.input.match(/\./)) {
            return;
        }
        this.new_input = false;
        this.input += '.';
    },
    sign: function() {
        if(this.new_input) {
            this.input = '';
        }
        this.new_input = false;
        if(this.input.match(/^-/)) {
            this.input = this.input.slice(1);
        } else {
            this.input = '-'+this.input;
        }
    },
    add_number: function() {
        let val;
        try {
            val = CReal.valueOf(this.input);
        } catch(e) {
            return;
        }
        this.new_input = true;
        if(!this.top_stack) {
            const item = this.current_stack[this.row];
            if(item.kind == 'number') {
                item.value = val;
                //this.current_stack.splice(this.row,1,new NumberItem(val));
            }
        } else {
            this.push(new NumberItem(val));
        }
    },
    add_constant: function(constant) {
        if(!this.top_stack) {
            const item = this.current_stack[this.row];
            if(item.kind == 'number') {
                this.current_stack.splice(this.row,1,new ConstantItem(constant));
                this.new_input = true;
                this.row += 1;
            }
            return;
        }
        const multiple = !this.new_input;
        if(multiple) {
            this.add_number();
        }
        this.push(new ConstantItem(constant));
        if(multiple) {
            this.add_op(ops.find(op=>op.op=='mul'));
        }
    },
    add_op: function(op) {
        if(!this.can_op(op)) {
            return;
        }
        if(!this.new_input) {
            this.add_number();
        }
        const arity = op.arity===Infinity ? this.row+1 : op.arity;
        const raw_args = this.current_stack.splice(this.row-(arity-1),arity);
        const args = [];
        for(let arg of raw_args) {
          if(arg.kind=='op') {
            arg.show_more_digits = false;
          }
          if(arg.kind=='op' && arg.op==op && op.chain) {
            args.splice(args.length,0,...arg.args);
          } else {
            args.push(arg);
          }
        }
        this.row -= arity;
        this.push(new Op(op,args));
    },
    add_custom: function(custom) {
        if(custom.kind=='constant') {
          let val = custom.fn();
          if(typeof(val)=='number') {
            val = CReal.valueOf(val);
          }
          this.push(new NumberItem(val));
        } else {
          this.add_op(custom.op_object());
        }
    },
    push: function(item) {
        while(!this.top_stack) {
            [this.current_stack,this.row] = this.parent_stacks.pop();
        }
        this.stack.splice(this.row+1,0,item);
        this.row += 1;
    },
    backspace: function() {
        this.input = this.input.slice(0, -1);
        this.new_input = this.new_input || this.input=='';
    },
    pop: function() {
        if(!this.can_pop) {
            return;
        }
        this.current_stack.splice(this.row,1);
        if(this.current_stack.length>0) {
            this.row = Math.max(0,this.row-1);
        } else {
            this.row = -1;
        }
    },
    swap: function() {
        if(this.row<1) {
            return;
        }
        const [a,b] = this.current_stack.splice(this.row-1,2);
        this.current_stack.splice(this.row-1,0,b,a);
    },
    show_more_digits: function() {
        const item = this.current_stack[this.row];
        if(item.kind == 'op') {
            item.show_more_digits = !item.show_more_digits;
        }
    },
    focus_name_input: function() {
        const input = this.$el.querySelector('.item.selected .edit-name');
        if(input) {
            input.focus();
        }
    },
    copy: function() {
        const item = this.current_stack[this.row];
        while(this.parent_stacks.length) {
            [this.current_stack,this.row] = this.parent_stacks.pop();
        }
        this.push(item.copy());
    },
    add_named_item(item) {
        this.push(item);
    },

    undo: function() {
        if(!this.can_undo) {
            return;
        }
        const [op] = this.current_stack.splice(this.row,1);
        this.current_stack.splice(this.row,0,...op.args);
        this.row += op.args.length-1;
    },

    edit_named: function() {
        this.mode = 'named';
    },

    pick_named_item: function() {
        this.mode = 'pick_named_item';
        this.typed_item_name = '';
    },

    pick_matching_named_item: function(item) {
        this.add_named_item(item);
        this.mode = 'calculator';
    },
    
    edit_custom: function() {
      this.mode = 'editor';
    },
    set_edit_op: function(op) {
      this.edit_op = op;
    },
    
    up: function() {
        if(this.row<=0) {
            return;
        }
        this.row -= 1;
    },
    down: function() {
        if(this.row >= this.current_stack.length-1) {
            return;
        } else {
            this.row += 1;
        }
    },
    left: function() {
        if(this.top_stack) {
            return;
        }
        [this.current_stack,this.row] = this.parent_stacks.pop();
    },
    right: function() {
        if(this.current_stack[this.row].kind!='op') {
            return;
        }
        this.parent_stacks.push([this.current_stack,this.row]);
        this.current_stack = this.current_stack[this.row].args;
        this.row = 0;
    },

    scroll_to_screen: function(d) {
        const screens_container = this.$el.querySelector('.screens');
        const scroll = screens_container.scrollTop;
        const screens = Array.from(screens_container.querySelectorAll('.screen'));
        const screen = screens.find(screen => screen.offsetTop >= scroll);
        const i = screens.indexOf(screen);
        const ni = (i + d + screens.length) % screens.length;

        const to_screen = this.$el.querySelectorAll('.screens > .screen')[ni];
        to_screen.scrollIntoView();
        const button = to_screen.querySelector('button:not(:disabled)');
        if(button) {
            button.focus();
        }
    },

    shift_up: function() {
        this.scroll_to_screen(-1);
    },

    shift_down: function() {
        this.scroll_to_screen(1);
    },

    click_item: function(path) {
        this.parent_stacks = [];
        this.current_stack = stack;
        for(let row of path.slice(0,path.length-1)) {
            this.parent_stacks.push([this.current_stack,row]);
            this.current_stack = this.current_stack[row].args;
        }
        this.row = path[path.length-1];
    },
    delete: function() {
        if(this.new_input) {
            this.pop();
        } else {
            this.input = '';
        }
    },
    escape: function() {
        if(this.mode != 'pick_named_item' && document.activeElement.tagName == 'INPUT') {
            document.activeElement.blur();
            return;
        }

        this.mode = 'calculator';
    },
    handle_keypress: function(e, keys) {
        if(keys[e.key]) {
            keys[e.key](e);
            e.preventDefault();
            e.stopPropagation();
        }
    },
    input_keypress: function(e) {
        let keys = {
          'Escape': e => this.escape(),
          'Enter': e => this.escape(),
        };
        this.handle_keypress(e, keys);
    },
    calculator_keypress: function(e) {
        if(e.ctrlKey || e.altKey || e.metaKey) {
          return;
        }
        let keys = {
          'Escape': e => this.escape()
        };
        switch(this.mode) {
          case 'calculator':
              keys = Object.assign(keys,{
                  'ArrowLeft': e => this.left(),
                  'ArrowRight': e => this.right(),
                  'ArrowUp': e => e.shiftKey ? this.shift_up() : this.up(),
                  'ArrowDown': e => e.shiftKey ? this.shift_down() : this.down(),
                  '`': e => this.sign(),
                  '0': e => this.digit(0),
                  '1': e => this.digit(1),
                  '2': e => this.digit(2),
                  '3': e => this.digit(3),
                  '4': e => this.digit(4),
                  '5': e => this.digit(5),
                  '6': e => this.digit(6),
                  '7': e => this.digit(7),
                  '8': e => this.digit(8),
                  '9': e => this.digit(9),
                  '.': e => this.dot(),
                  '-': e => this.sign(),
                  'Enter': e => this.add_number(),
                  'Delete': e => this.delete(),
                  'Backspace': e => this.backspace(),
                  'u': e => this.undo(),
                  'd': e => this.copy(),
                  'w': e => this.swap(),
                  '?': e => this.show_more_digits(),
                  'n': e => this.focus_name_input(),
                  'v': e => this.edit_named(),
                  '@': e => this.pick_named_item(),
              });
              for(let o of this.ops) {
                  keys[o.key] = e => this.add_op(o);
              }
              for(let c of this.constants) {
                  if(c.key) {
                      keys[c.key] = e => this.add_constant(c);
                  }
              }
            break;
          case 'editor':
            keys = Object.assign(keys,{
            });
            break;
        }
        this.handle_keypress(e, keys);
    },
    playback: function(expr_string) {
      const expr = decodeURIComponent(expr_string).split(',');
      const label_dict = {};
      for(let item of expr) {
        if(item.match(/^-?\d/)) {
          this.push(new NumberItem(CReal.valueOf(item)));
        } else if(item.match(/^\$/)) {
          const label = item.slice(1);
          const n = label_dict[label] = label_dict[label] || this.stack[this.stack.length-1];
          n.label = label;
          this.stack[this.stack.length-1] = label_dict[label];
        } else {
          const op = ops.find(x=>x.op==item);
          const constant = constants.find(x=>x.label==item);
          if(op) {
            this.add_op(op);
          } else if(constant) {
            this.push(new ConstantItem(constant));
          }
        }
      }
    }
  }
})

document.body.addEventListener('keydown',function(e) {
    if(e.target.tagName == 'A') {
        return;
    } else if(e.target.tagName=='INPUT') {
        app.input_keypress(e);
    } else {
        app.calculator_keypress(e);
    }
})

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('service-worker.js').then(function(registration) {
    }, function(err) {
    });
  });
}

if(playback_expression) {
  app.playback(playback_expression.slice(1));
}
