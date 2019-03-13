/* global module, document, Node */
import {Module} from './modules/module';
import {Hooks} from './hooks';
import vnode, {VNode, VNodeData, Key} from './vnode';
import * as is from './is';
import htmlDomApi, {DOMAPI} from './htmldomapi';

function isUndef(s: any): boolean { return s === undefined; }
function isDef(s: any): boolean { return s !== undefined; }

type VNodeQueue = Array<VNode>;

/**
 * 空结点
 * 
 * {
 *   sel = '',
 *   data = {},
 *   children = [],
 *   text = undefined,
 *   elm = undefined,
 *   key = undefined
 * }
 */
const emptyNode = vnode('', {}, [], undefined, undefined);

// 判断两个 vnode 是否相似
function sameVnode(vnode1: VNode, vnode2: VNode): boolean {
  // 比较两个 vnode 的 key 和 选择器
  return vnode1.key === vnode2.key && vnode1.sel === vnode2.sel;
}

// 判断是否 Vnode 类型
function isVnode(vnode: any): vnode is VNode {
  // 根据是否有 sel
  return vnode.sel !== undefined;
}

type KeyToIndexMap = {[key: string]: number};

type ArraysOf<T> = {
  [K in keyof T]: (T[K])[];
}

type ModuleHooks = ArraysOf<Module>;

// 获取 key 和 index 的映射关系
function createKeyToOldIdx(
  children: Array<VNode>,
  beginIdx: number,
  endIdx: number
): KeyToIndexMap {
  let i: number, 
      map: KeyToIndexMap = {}, 
      key: Key | undefined, 
      ch;

  for (i = beginIdx; i <= endIdx; ++i) {
    ch = children[i];
    if (ch != null) {
      key = ch.key;
      if (key !== undefined) map[key] = i;
    }
  }
  return map;
}

// 一些模块钩子名称
const hooks: (keyof Module)[] = [
  'create', // 创建
  'update', // 更新
  'remove', // 删除
  'destroy', // 销毁
  'pre', // 开始
  'post' // 结束
];

export {h} from './h';
export {thunk} from './thunk';

/**
 * 
 * @param modules 一些模块
 * @param domApi 操作 Dom 的接口，开放不同平台的接口
 * 
 * @returns patch 补丁函数，用于将新旧结点的差异更新到 Dom 上
 */
export function init(modules: Array<Partial<Module>>, domApi?: DOMAPI) {
  let i: number,  // i、j 两个计数变量
      j: number,
      cbs = ({} as ModuleHooks); // 用于存放各个 modules 的钩子函数

  // 默认使用 html 接口
  const api: DOMAPI = domApi !== undefined ? domApi : htmlDomApi;

  for (i = 0; i < hooks.length; ++i) {
    /**
     * 初始化 cbs
     * 
     * cbs = {
     *   'create': [],
     *   'update': [],
     *   'remove': [],
     *   'destroy': [],
     *   'pre': [],
     *   'post': [],
     * }
     */
    cbs[hooks[i]] = [];
    for (j = 0; j < modules.length; ++j) {
      const hook = modules[j][hooks[i]];
      // 将每个 module 各个钩子函数存入 cbs
      if (hook !== undefined) {
        (cbs[hooks[i]] as Array<any>).push(hook);
      }
    }
  }

  // 根据 Dom 结点创建新的 vnode 空结点
  function emptyNodeAt(elm: Element) {
    const id = elm.id ? '#' + elm.id : '';
    const c = elm.className ? '.' + elm.className.split(' ').join('.') : '';

    /**
     * 生成形如以下的 vnode
     * 
     * {
     *   sel = 'div#id.class1.class2',
     *   data = {},
     *   children = [],
     *   text = undefined,
     *   elm = elm,
     *   key = undefined
     * }
     */
    return vnode(api.tagName(elm).toLowerCase() + id + c, {}, [], undefined, elm);
  }

  function createRmCb(childElm: Node, listeners: number) {
    return function rmCb() {
      // 最后一个 remove 钩子执行完毕，再将结点移除
      if (--listeners === 0) {
        const parent = api.parentNode(childElm);
        api.removeChild(parent, childElm);
      }
    };
  }

  // 将 vnode 转换为真正的 DOM 元素
  function createElm(vnode: VNode, insertedVnodeQueue: VNodeQueue): Node {
    let i: any, 
        data = vnode.data;

    if (data !== undefined) {
      if (isDef(i = data.hook) && isDef(i = i.init)) {
        // 调用 vnode 的 init 钩子
        i(vnode);
        data = vnode.data;
      }
    }
    let children = vnode.children,
        sel = vnode.sel;

    // ！ 代表注释
    if (sel === '!') {
      if (isUndef(vnode.text)) {
        // 如果有 text ，则把 text 置空
        vnode.text = '';
      }
      // 生成注释
      vnode.elm = api.createComment(vnode.text as string);
    } else if (sel !== undefined) {
      // Parse selector 
      // 解析选择器, 形如 `div#id.class1.class2`
      const hashIdx = sel.indexOf('#');
      const dotIdx = sel.indexOf('.', hashIdx);
      const hash = hashIdx > 0 ? hashIdx : sel.length;
      const dot = dotIdx > 0 ? dotIdx : sel.length;
      const tag = hashIdx !== -1 || dotIdx !== -1 ? sel.slice(0, Math.min(hash, dot)) : sel;
      // 根据 vnode.data 是否有 ns 创建元素，并关联到 vnode 的 elm 上
      const elm = vnode.elm = isDef(data) && isDef(i = (data as VNodeData).ns) ? api.createElementNS(i, tag)
                                                                               : api.createElement(tag);
      // 设置 id 属性
      if (hash < dot) 
        elm.setAttribute('id', sel.slice(hash + 1, dot));
      // 设置 class 属性
      if (dotIdx > 0) 
        elm.setAttribute('class', sel.slice(dot + 1).replace(/\./g, ' '));

      // 调用 modules 的 create 钩子
      for (i = 0; i < cbs.create.length; ++i) cbs.create[i](emptyNode, vnode);

      // children 不是数组的情况呢？
      if (is.array(children)) {
        // children 是数组的情况
        for (i = 0; i < children.length; ++i) {
          const ch = children[i];
          if (ch != null) {
            // 递归创建子结点
            api.appendChild(elm, createElm(ch as VNode, insertedVnodeQueue));
          }
        }
      } else if (is.primitive(vnode.text)) {
        // 子结点为 text 的情况
        api.appendChild(elm, api.createTextNode(vnode.text));
      }
      i = (vnode.data as VNodeData).hook; // Reuse variable
      if (isDef(i)) {
        if (i.create) 
          // 调用 vnode 的 create 钩子
          i.create(emptyNode, vnode);

        // 收集已插入 DOM 的 vnode
        if (i.insert) 
          insertedVnodeQueue.push(vnode);
      }
    } else {
      // 生成 text 并关联至 vnode.elm
      vnode.elm = api.createTextNode(vnode.text as string);
    }
    // 返回生成的 DOM 元素
    return vnode.elm;
  }

  // 将 vnodes 生成 DOM 元素并插入 DOM
  function addVnodes(parentElm: Node,
                     before: Node | null,
                     vnodes: Array<VNode>,
                     startIdx: number,
                     endIdx: number,
                     insertedVnodeQueue: VNodeQueue
  ) {
    // 循环将 vnodes 生成 DOM 元素并插入 DOM
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx];
      if (ch != null) {
        api.insertBefore(parentElm, createElm(ch, insertedVnodeQueue), before);
      }
    }
  }

  function invokeDestroyHook(vnode: VNode) {
    let i: any,
        j: number, 
        data = vnode.data;

    if (data !== undefined) {
      if (
        isDef(i = data.hook) && 
        isDef(i = i.destroy)
      ) i(vnode);

      // 调用 destroy 回调
      for (i = 0; i < cbs.destroy.length; ++i) 
        cbs.destroy[i](vnode);

      if (vnode.children !== undefined) {
        // 深度优先遍历调用 destroy 回调
        for (j = 0; j < vnode.children.length; ++j) {
          i = vnode.children[j];
          if (i != null && typeof i !== "string") {
            invokeDestroyHook(i);
          }
        }
      }
    }
  }

  // 删除 VNodes
  function removeVnodes(
    parentElm: Node,
    vnodes: Array<VNode>,
    startIdx: number,
    endIdx: number
  ): void {
    for (; startIdx <= endIdx; ++startIdx) {
      let i: any, 
          listeners: number, 
          rm: () => void, 
          ch = vnodes[startIdx];

      if (ch != null) {
        if (isDef(ch.sel)) { // 判断是否是 vnode ,等同于 isVnode(ch)
          // 调用 ch 结点的 destroy 钩子
          invokeDestroyHook(ch);

          // 获得 modules 中 remove 钩子数量
          listeners = cbs.remove.length + 1;
          // 创建删除回调函数，延迟执行
          rm = createRmCb(ch.elm as Node, listeners);

          // 调用所有模块的 remove 钩子
          for (i = 0; i < cbs.remove.length; ++i) 
            cbs.remove[i](ch, rm);

          // 如果有钩子则调用钩子后再调用删除回调；如果没有，则直接调用删除回调
          if (isDef(i = ch.data) && isDef(i = i.hook) && isDef(i = i.remove)) {
            // ch.data.hook.remove(ch, rm)
            i(ch, rm);
          } else {
            rm();
          }
        } else { // Text node
          api.removeChild(parentElm, ch.elm as Node);
        }
      }
    }
  }

  function updateChildren(
    parentElm: Node,
    oldCh: Array<VNode>,
    newCh: Array<VNode>,
    insertedVnodeQueue: VNodeQueue
  ) {
    let oldStartIdx = 0, // 旧队列开始下标
        newStartIdx = 0; // 新队列开始下标
    let oldEndIdx = oldCh.length - 1; // 旧队列结束下标
    let oldStartVnode = oldCh[0]; // 旧队列开始结点
    let oldEndVnode = oldCh[oldEndIdx]; // 旧队列结束结点
    let newEndIdx = newCh.length - 1; // 新队列结束下标
    let newStartVnode = newCh[0]; // 新队列开始结点
    let newEndVnode = newCh[newEndIdx]; // 新队列结束结点
    let oldKeyToIdx: any; // 旧队列 key、index 映射关系表
    let idxInOld: number;
    let elmToMove: VNode;
    let before: any;

    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      // 检查四个下边对应 vnode 非空的情况
      if (oldStartVnode == null) {
        oldStartVnode = oldCh[++oldStartIdx]; // Vnode might have been moved left
      } else if (oldEndVnode == null) {
        oldEndVnode = oldCh[--oldEndIdx];
      } else if (newStartVnode == null) {
        newStartVnode = newCh[++newStartIdx];
      } else if (newEndVnode == null) {
        newEndVnode = newCh[--newEndIdx];
      } 
      
      // 新旧队列首尾四个结点相似的情况，做移动或更新处理
      else if (sameVnode(oldStartVnode, newStartVnode)) {
        // 两个队列的首结点相似，执行 patch，不需要移动 DOM
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue);
        oldStartVnode = oldCh[++oldStartIdx];
        newStartVnode = newCh[++newStartIdx];
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        // 两个队列的尾结点相似，执行 patch，不需要移动 DOM
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue);
        oldEndVnode = oldCh[--oldEndIdx];
        newEndVnode = newCh[--newEndIdx];
      } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right
        // 旧队列的首结点与新队列的尾结点相似，说明原来列表第一项的位置调整到列表最后去了
        // 执行 patch
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue);
        // 移动旧队列首结点对应的 DOM 结点到 DOM 列表的最后
        api.insertBefore(parentElm, oldStartVnode.elm as Node, api.nextSibling(oldEndVnode.elm as Node));
        oldStartVnode = oldCh[++oldStartIdx];
        newEndVnode = newCh[--newEndIdx];
      } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left
        // 旧队列的尾结点与新队列的首结点相似，说明原来列表最后一项的位置调整到列表最前面去了
        // 执行 patch
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue);
        // 操作 DOM 把最后一项挪到最前
        api.insertBefore(parentElm, oldEndVnode.elm as Node, oldStartVnode.elm as Node);
        oldEndVnode = oldCh[--oldEndIdx];
        newStartVnode = newCh[++newStartIdx];
      } 
      
      // 四个首尾结点都不相似的情况
      // 这里是 diff 算法核心，同层次的比较两个列表。通过一个 hashmap 将时间复杂度降至 O(n)
      else {
        // 创建一次旧队列的 key 和 index 关系映射表：key -> index
        if (oldKeyToIdx === undefined) {
          oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx);
        }
        // 获取旧队列中新结点的 key 值对应的结点的下标
        idxInOld = oldKeyToIdx[newStartVnode.key as string];
        if (isUndef(idxInOld)) { // New element
          // 旧队列里没有这个 vnode，创建并插入 DOM 
          api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm as Node);
          newStartVnode = newCh[++newStartIdx];
        } else {
          // 存在相同的 key 值得情况
          elmToMove = oldCh[idxInOld];
          // 选择器不一样，则创建新的结点插入 DOM。否则 patch，然后调整位置
          if (elmToMove.sel !== newStartVnode.sel) {
            api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm as Node);
          } else {
            patchVnode(elmToMove, newStartVnode, insertedVnodeQueue);
            oldCh[idxInOld] = undefined as any;
            api.insertBefore(parentElm, (elmToMove.elm as Node), oldStartVnode.elm as Node);
          }
          newStartVnode = newCh[++newStartIdx];
        }
      }
    }

    // 循环结束后，处理可能未处理到的 vnode
    if (oldStartIdx <= oldEndIdx || newStartIdx <= newEndIdx) {
      // newVnodes 中未处理完的直接加入，反之移除
      if (oldStartIdx > oldEndIdx) {
        before = newCh[newEndIdx+1] == null ? null : newCh[newEndIdx+1].elm;
        addVnodes(parentElm, before, newCh, newStartIdx, newEndIdx, insertedVnodeQueue);
      } else {
        removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx);
      }
    }
  }

  function patchVnode(oldVnode: VNode, vnode: VNode, insertedVnodeQueue: VNodeQueue) {
    let i: any, hook: any;
    if (
      isDef(i = vnode.data) && 
      isDef(hook = i.hook) && 
      isDef(i = hook.prepatch)
    ) {
      // i = vnode.data.hook.prepatch
      // 调用 prepatch 回调
      i(oldVnode, vnode);
    }
    // vnode 关联的 elm 赋值 为 oldVnode 关联的 elm
    const elm = vnode.elm = (oldVnode.elm as Node);
    // 旧结点的子结点
    let oldCh = oldVnode.children;
    // 新结点的子结点
    let ch = vnode.children;
    // 是相同引用则直接返回
    if (oldVnode === vnode) return;

    if (vnode.data !== undefined) {
      // 调用 cbs 中所有模块的 update 回调
      for (i = 0; i < cbs.update.length; ++i) 
        cbs.update[i](oldVnode, vnode);

      // 调用 vnode.data.hook.update 回调
      i = vnode.data.hook;
      if (isDef(i) && isDef(i = i.update)) 
        i(oldVnode, vnode);
    }

    if (isUndef(vnode.text)) {
      // 存在 vnode 子结点的情况
      if (isDef(oldCh) && isDef(ch)) {
        // 新旧子结点都存在
        if (oldCh !== ch)
          // 核心逻辑，比较新旧 children 并更新
          updateChildren(
            elm,
            oldCh as Array<VNode>,
            ch as Array<VNode>,
            insertedVnodeQueue
          );
      } else if (isDef(ch)) {
        // 新结点有子结点，旧结点没有子结点的情况
        if (isDef(oldVnode.text)) 
          // 如果旧结点原来有 text，则把 text 置为空串 
          api.setTextContent(elm, '');
        // 往 DOM 里边添加 vnode 的子结点
        addVnodes(elm, null, ch as Array<VNode>, 0, (ch as Array<VNode>).length - 1, insertedVnodeQueue);
      } else if (isDef(oldCh)) {
        // 旧结点有子结点，新结点没有子结点的情况
        // 移除 DOM 里边旧结点的子结点
        removeVnodes(elm, oldCh as Array<VNode>, 0, (oldCh as Array<VNode>).length - 1);
      } else if (isDef(oldVnode.text)) {
        // 旧结点有文本结点，新结点没有文本结点的情况
        api.setTextContent(elm, '');
      }
    } else if (oldVnode.text !== vnode.text) {
      // 新旧结点的文本结点不一样
      if (isDef(oldCh)) {
        // 如果旧结点有 children 的情况，先移除旧结点的 children ，触发相关钩子
        removeVnodes(
          elm,
          oldCh as Array<VNode>,
          0,
          (oldCh as Array<VNode>).length - 1
        );
      }
      // 将 vnode 上的文本更新到 dom 结点的 textContent
      api.setTextContent(elm, vnode.text as string);
    }

    // 调用 postpatch 回调
    if (isDef(hook) && isDef(i = hook.postpatch)) {
      i(oldVnode, vnode);
    }
  }

  // 用于修补 Dom 的补丁函数
  return function patch(oldVnode: VNode | Element, vnode: VNode): VNode {
    let i: number,
        elm: Node,
        parent: Node;

    // 用于收集所有插入的元素
    const insertedVnodeQueue: VNodeQueue = [];

    // 调用 pre 钩子
    for (i = 0; i < cbs.pre.length; ++i) cbs.pre[i]();

    // 旧结点不是 vnode，则创建一个空的 vnode
    if (!isVnode(oldVnode)) {
      oldVnode = emptyNodeAt(oldVnode);
    }

    if (sameVnode(oldVnode, vnode)) {
      // 新旧结点相似，则进行修补
      patchVnode(oldVnode, vnode, insertedVnodeQueue);
    } else {
      // 新旧结点不相似，则新建新结点
      elm = oldVnode.elm as Node;
      parent = api.parentNode(elm);

      createElm(vnode, insertedVnodeQueue);

      // 插入新结点，删除旧结点
      if (parent !== null) {
        api.insertBefore(parent, vnode.elm as Node, api.nextSibling(elm));
        removeVnodes(parent, [oldVnode], 0, 0);
      }
    }

    // 调用已插入结点的 insert 钩子
    for (i = 0; i < insertedVnodeQueue.length; ++i) {
      (((insertedVnodeQueue[i].data as VNodeData).hook as Hooks).insert as any)(insertedVnodeQueue[i]);
    }

    // 调用 post 钩子
    for (i = 0; i < cbs.post.length; ++i) cbs.post[i]();

    // 返回新的 vnode
    return vnode;
  };
}
