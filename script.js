//VueHammer.config.swipe = {
//  threshold: 100
//};
Vue.use(VueHammer);

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
    let s = this.value+'';
    if(this.label) {
      s += ',$'+this.label;
    }
    return s;
  }
  toNotation() {
    return this.value+'';
  }
}
NumberItem.prototype.kind = 'number';

class Op extends Item {
  constructor(op,args) {
    super();
    this.op = op;
    this.args = args;
  }
  copy() {
    return new Op(this.op,this.args.map(x=>x.copy()));
  }
  get value() {
    return fns[this.op.op](...this.args.map(x=>x.value));
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
    if(this.op.precedence) {
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
    props: ['item'],
    template: `
  <span class="number">{{item.value.toString()}}</span>
`,
})

Vue.component('item-op', {
    props: ['op','args','value','depth','path','selection_path'],
    data: function() {
        return {
            collapsed: this.depth>0
        }
    },
    watch: {
      selection_path: function(newPath,oldPath) {
        if(JSON.stringify(newPath)==JSON.stringify(oldPath)) {
            return;
        }
        if((this.selection_path || []).length>0) {
          this.collapsed = false;
        } else {
          this.collapsed = this.depth>0;
        }
      }
    },
    methods: {
        click_item: function(path) {
            this.$emit('click-item',path)
        },
        collapse: function() {
            this.collapsed = !this.collapsed;
            console.log('collapse',this.collapsed);
        }
    }, 
    template: `
        <div class="op" :class="{collapsed: collapsed}">
            <item-stack v-if="!collapsed" :items="args" :depth="depth+1" :path="path" :selection_path="selection_path" @click-item="click_item"></item-stack>
            <div class="symbol" v-if="!collapsed">{{op.label}}</div>
            <div class="show-collapsed" v-if="collapsed" @click="collapse">...</div>
            <div class="number result" @click="collapse">{{value.toString()}}</div>
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
        }
    },
    mounted: function() {
        this.$el.scrollIntoView({block: 'center'});
    },
    computed: {
        top: function() {
            return this.path.length<=1;
        },
        show_notation: function() {
            return this.top && this.item.kind=='op';
        }
    },
    watch: {
        selected: function() {
            if(this.selected) {
                this.$el.scrollIntoView({block: 'center'});
            }
        }
    },
    template: `
        <div class="item-container" @click="click">
          <li class="item" :class="[selected ? 'selected' : '',item.kind]">
              <span v-if="item.label" class="label">{{item.label}}</span>
              <item-number v-if="item.kind=='number'" :item="item"></item-number>
              <item-op v-if="item.kind=='op'" :op="item.op" :args="item.args" :value="item.value" :depth="depth" :path="path" :selection_path="selection_path" @click-item="click_item"></item-op>
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
    n = n.abs().floor();
    let t = new Decimal(1);
    while(n>=1 && t<Infinity) {
        t = t.times(n)
        n = n.minus(1);
    }
    return t;
}
function combinations(n,r) {
    return factorial(n).dividedBy(factorial(r).times(factorial(n.minus(r))));
}
function permutations(n,r) {
    return factorial(n).dividedBy(factorial(n.minus(r)));
}

function sum(...args) {
  let t = new Decimal(0);
  for(let n of args) {
    t = t.add(n);
  }
  return t;
}
function product(...args) {
  let t = new Decimal(1);
  for(let n of args) {
    t = t.times(n);
  }
  return t;
}

function mean(...args) {
  return sum(...args).dividedBy(args.length);
}

const ops = [
    {op: 'add', 'label': '+', 'key': '+', arity: 2, fn: sum, screen: 'main', chain: true, precedence: 1, symbol: '+'},
    {op: 'sub', 'label': '-', 'key': '-', arity: 2, fn: (a,b) => a.minus(b), screen: 'main', precedence: 1, symbol: '-'},
    {op: 'mul', 'label': '×', 'key': '*', arity: 2, fn: product, screen: 'main', chain: true, precedence: 2, symbol: '×'},
    {op: 'div', 'label': '÷', 'key': '/', arity: 2, fn: (a,b) => a.dividedBy(b), screen: 'main', precedence: 2, symbol: '÷'},
    {op: 'sin', 'label': 'Sin', 'key': 's', arity: 1, fn: a => a.sine(), area: 'num-7', screen: 'trig'},
    {op: 'cos', 'label': 'Cos', 'key': 'c', arity: 1, fn: a => a.cosine(), area: 'num-8', screen: 'trig'},
    {op: 'tan', 'label': 'Tan', 'key': 't', arity: 1, fn: a => a.tangent(), area: 'num-9', screen: 'trig'},
    {op: 'arcsin', 'label': 'Sin⁻¹', 'key': 'S', arity: 1, fn: a => a.inverseSine(), area: 'num-4', screen: 'trig'},
    {op: 'arccos', 'label': 'Cos⁻¹', 'key': 'C', arity: 1, fn: a => a.inverseCosine(), area: 'num-5', screen: 'trig'},
    {op: 'arctan', 'label': 'Tan⁻¹', 'key': 'T', arity: 1, fn: a => a.inverseTangent(), area: 'num-6', screen: 'trig'},
    {op: 'square', 'label': 'x²', 'key': '^', arity: 1, fn: x => x.times(x), area: 'num-0', screen: 'trig'},
    {op: 'root', 'label': '√', 'key': 'r', arity: 1, fn: x => x.squareRoot(), area: 'sign', screen: 'trig', symbol: '√'},
    {op: 'pow', 'label': 'xʸ', 'key': 'p', arity: 2, fn: (a,b) => a.toPower(b), area: 'dot', screen: 'trig', precedence: '3', symbol: '^'},
    {op: 'ln', 'label': 'ln', 'key': 'l', arity: 1, fn: a => a.naturalLogarithm(), area: 'op-mul', screen: 'trig'},
    {op: 'log', 'label': 'log', 'key': 'L', arity: 1, fn: a => a.logarithm(), area: 'op-div', screen: 'trig'},
    {op: 'exp', 'label': 'eˣ', 'key': 'e', arity: 1, fn: a => a.naturalExponential(), area: 'op-add', screen: 'trig'},
    {op: 'exp10', 'label': '10ˣ', 'key': 'E', arity: 1, fn: a => (new Decimal(10)).toPower(a), area: 'op-sub', screen: 'trig'},
    {op: 'factorial', 'label': 'x!', 'key': '!', arity: 1, fn: factorial, area: 'num-3', screen: 'trig'},
    {op: 'combinations', 'label': 'ⁿCᵣ', 'key': '', arity: 2, fn: combinations, area: 'constant-pi', screen: 'trig'},
    {op: 'permutations', 'label': 'ⁿPᵣ', 'key': '', arity: 2, fn: permutations, area: 'constant-e', screen: 'trig'},
    {op: 'mean', 'label': 'Mean', 'key': 'm', arity: Infinity, fn: mean, area: 'num-1', screen: 'trig'},
    {op: 'mod', 'label': 'Mod', 'key': '%', arity: 2, fn: (a,b) => a.mod(b), area: 'num-2', screen: 'trig'},
];

const constants = [
    {name: 'pi', value: new Decimal(Math.PI), label: 'π', screen: 'main'},
    {name: 'e', value: new Decimal(Math.E), label: 'e', screen: 'main'},
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
const app = new Vue({
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
    screens: ['main','trig','custom'],
    screen_index: 0,
    
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
          return this.top_stack && this.selection;
      },
      can_swap: function() {
          return this.row>0;
      },
      title: function() {
          const main = "CLP's Nice Calculator";
          if(this.selection) {
              return `${this.selection.value} - ${main}`;
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
            this.input = item.value+'';
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
            val = new Decimal(this.input);
        } catch(e) {
            return;
        }
        if(val.isNaN()) {
            return;
        }
        this.new_input = true;
        if(!this.top_stack) {
            const item = this.current_stack[this.row];
            if(item.kind == 'number') {
                item.value = val;
                this.reevaluate();
            }
        } else {
            this.push(new NumberItem(val));
        }
    },
    add_constant: function(constant) {
      this.push(new NumberItem(constant.value));
    },
    reevaluate: function() {
        for(let [stack,row] of this.parent_stacks.slice().reverse()) {
            const item = stack[row];
            item.value = fns[item.op.op](...item.args.map(x=>x.value));
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
          if(arg.kind=='op' && arg.op==op && op.chain) {
            args.splice(args.length,0,...arg.args);
          } else {
            args.push(arg);
          }
        }
        this.row -= arity;
        this.push(new Op(op,args));
        this.reevaluate();
    },
    add_custom: function(custom) {
        if(custom.kind=='constant') {
          let val = custom.fn();
          if(typeof(val)=='number') {
            val = new Decimal(val);
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
        if(!this.top_stack) {
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
    copy: function() {
        const item = this.current_stack[this.row];
        while(this.parent_stacks.length) {
            [this.current_stack,this.row] = this.parent_stacks.pop();
        }
        this.push(item.copy());
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
              });
              for(let o of this.ops) {
                  keys[o.key] = e => this.add_op(o);
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
          this.push(new NumberItem(new Decimal(item)));
        } else if(item.match(/^\$/)) {
          const label = item.slice(1);
          const n = label_dict[label] = label_dict[label] || this.stack[this.stack.length-1];
          n.label = label;
          this.stack[this.stack.length-1] = label_dict[label];
        } else {
          const op = ops.find(x=>x.op==item);
          this.add_op(op);
        }
      }
    }
  }
})
document.body.addEventListener('keydown',function(e) {
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