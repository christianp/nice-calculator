import emoji from './emoji.js';
import CReal from './creal.js';

//VueHammer.config.swipe = {
//  threshold: 100
//};
Vue.use(VueHammer);

class CalculationError {
    constructor(e) {
        this.error = e;
    }
    toString() {
        return 'ERR';
    }
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
    return args+','+op;
  }
  toNotation() {
    if(this.op.toNotation) {
        return this.op.toNotation(this.args);
    } else if(this.op.precedence) {
      const args = this.args.map(arg=>{
        const argn = arg.toNotation();
        if(arg instanceof Op && (arg.op.precedence<this.op.precedence || (arg.op.precedence==this.op.precedence && arg.op.symbol!=this.op.symbol))) {
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
  methods: {
    prevent_mouse: function(e) {
      e.preventDefault();
    },
    click: function(e) {
      this.$emit('click',e);
      this.$el.focus();
      if(!this.$el.disabled) {
        window.navigator.vibrate(30);
      }
    }
  },
  template: `<button @touchstart="prevent_mouse" v-hammer:tap="click"><slot></slot></button>`
})

Vue.component('item-number', {
    props: ['value'],
    computed: {
        has_error: function() {
            return this.value instanceof CalculationError;
        }
    },
    methods: {
      display: function() {
        const value = this.value;
        return nice_number(this.value);
      }
    },
    template: `
  <span class="number" :class="{error: has_error}">{{display()}}</span>
`,
})

Vue.component('item-op', {
    props: ['op','args','value','depth','path','selection_path', 'value_collapsed'],
    data: function() {
        return {
            args_collapsed: this.depth>0,
            digits_shown : 500
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
        click_item: function(path) {
            this.$emit('click-item',path)
        },
        collapse_args: function() {
            this.args_collapsed = !this.args_collapsed;
        },
        collapse_values: function() {
            this.value_collapsed = !this.value_collapsed;
        },
        display: function() {
            return nice_number(this.value);
        },
        scroll_more_digits: function(e) {
            const p = e.target;
            if(p.scrollTop > p.scrollHeight - 100) {
                this.digits_shown += 500;
            }
        },
        tap: function() {
            if(window.getSelection().type == 'Range') {
                return;
            }
            this.$emit('collapse_values')
        }
    },
    template: `
        <div class="op" :class="{'args=collapsed': args_collapsed, 'value-collapsed': value_collapsed}">
            <item-stack v-if="!args_collapsed" :items="args" :depth="depth+1" :path="path" :selection_path="selection_path" @click-item="click_item"></item-stack>
            <div class="symbol" v-if="!args_collapsed" @click="collapse_args">{{op.label}}</div>
            <div class="show-collapsed" v-if="args_collapsed" @click="collapse_args">...</div>
            <div class="result" @click="tap">
                <item-number v-if="value_collapsed" :value="value"></item-number>
                <pre class="more-digits" v-if="!value_collapsed" @scroll="scroll_more_digits"><span class="whole">{{more_digits.whole}}</span><span v-if="more_digits.frac">.</span><span class="frac" v-if="more_digits.frac">{{more_digits.frac}}</span></pre>
            </div>
        </div>
    `
})

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
          this.item.show_more_digits = !this.item.show_more_digits;
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
        <div class="item-container" @click="click">
          <input v-if="selected && item.kind=='number' && !item.constant" class="edit-name" v-model="item.label"></input>
          <li class="item" :class="[selected ? 'selected' : '',item.kind]">
              <span v-if="item.constant || !selected && item.label" class="label">{{item.label}}</span>
              <item-number v-if="item.kind=='number'" :value="item.value"></item-number>
              <item-op v-if="item.kind=='op'" :op="item.op" :args="item.args" :value="item.value" :depth="depth" :path="path" :selection_path="selection_path" :value_collapsed="!item.show_more_digits" @click-item="click_item" @collapse_values="collapse_values"></item-op>
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
            <stack-item v-for="(item,index) in items" :key="item.id" :item="item" :depth="depth" :path="path.concat([index])" :selection_path="selection_path.length && selection_path[0]==index ? selection_path.slice(1) : []" :selected="selected && index==row" @click-item="click_item">
            </stack-item>
    </transition-group>
</div>
    `
})

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
    {op: 'add', 'label': '+', 'key': '+', arity: 2, fn: sum, screen: 'main', chain: true, precedence: 1, symbol: '+'},
    {op: 'sub', 'label': '-', 'key': '-', arity: 2, fn: (a,b) => a.subtract(b), screen: 'main', precedence: 1, symbol: '-'},
    {op: 'mul', 'label': '×', 'key': '*', arity: 2, fn: product, screen: 'main', chain: true, precedence: 2, symbol: '×'},
    {op: 'div', 'label': '÷', 'key': '/', arity: 2, fn: (a,b) => a.divide(b), screen: 'main', precedence: 2, symbol: '÷'},
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
    this.code = '';
    this.kind = 'unary';
    this.symbol = '';
    this.valid = false;
  }
  
  op_object() {
    const symbol = this.symbol;
    const arity = {constant: 0, unary: 1, binary: 2}[this.kind];
    return {
      op: this.op, 
      'label': symbol, 
      arity: arity,
      fn: this.fn,
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
    screens: ['main','trig','custom','named'],
    screen_index: 0 ,
    constants: constants,
    
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
      screen: function() {
          return this.screens[this.screen_index];
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
          return this.stack.join(',');
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
        let code = this.edit_op.code;
        if(!code.match(/\n/)) {
          code = `return ${code}`;
        }
        try {
          switch(this.edit_op.kind) {
            case 'unary':
              fn = new Function('a',code);
              break;
            case 'binary':
              fn = new Function('a','b',code);
              break;
            case 'constant':
              fn = new Function(this.code);
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
        this.edit_op.valid = this.editor_fn!==null;
        this.edit_op.fn = this.editor_fn;
        fns[this.edit_op.op] = this.edit_op.fn;
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
        this.screen_index = 0;
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
        this.input = this.input.slice(0,this.input.length-1);
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
        console.log(item);
        if(item.kind == 'op') {
            item.show_more_digits = !item.show_more_digits;
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
    
    edit_custom: function() {
      this.mode = 'editor';
    },
    set_edit_op: function(op) {
      console.log(arguments);
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
        this.row = this.current_stack.length-1;
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
    next_screen: function() {
        this.screen_index = (this.screen_index+1) % this.screens.length;
    },
    previous_screen: function() {
        this.screen_index = (this.screen_index+this.screens.length-1) % this.screens.length;
    },
    swipe: function(e) {
      switch(e.direction) {
        case Hammer.DIRECTION_LEFT:
          this.previous_screen();
          break;
        case Hammer.DIRECTION_RIGHT:
          this.next_screen();
          break;
      }
    },
    delete: function() {
        if(this.new_input) {
            this.pop();
        } else {
            this.input = '';
        }
    },
    escape: function() {
      this.mode = 'calculator';
    },
    keypress: function(e) {
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
                  'ArrowUp': e => this.up(),
                  'ArrowDown': e => this.down(),
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
                  'Tab': e => this.next_screen(),
                  'u': e => this.undo(),
                  'd': e => this.copy(),
                  'w': e => this.swap(),
                  '?': e => this.show_more_digits()
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
        if(keys[e.key]) {
            keys[e.key]();
            e.preventDefault();
            e.stopPropagation();
        }
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
    if(e.target.tagName=='INPUT') {
      return;
    }
    app.keypress(e);
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
