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

function createKeyToOldIdx(children: Array<VNode>, beginIdx: number, endIdx: number): KeyToIndexMap {
  let i: number, map: KeyToIndexMap = {}, key: Key | undefined, ch;
  for (i = beginIdx; i <= endIdx; ++i) {
    ch = children[i];
    if (ch != null) {
      key = ch.key;
      if (key !== undefined) map[key] = i;
    }
  }
  return map;
}

// 一些钩子名称
const hooks: (keyof Module)[] = [
  'create', // 创建
  'update', // 更新
  'remove', // 删除
  'destroy', // 销毁
  'pre', 
  'post'
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
      // 当监听数量为零，则从父结点移除该结点
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
        i(vnode);
        data = vnode.data;
      }
    }
    let children = vnode.children, sel = vnode.sel;
    if (sel === '!') {
      if (isUndef(vnode.text)) {
        vnode.text = '';
      }
      vnode.elm = api.createComment(vnode.text as string);
    } else if (sel !== undefined) {
      // Parse selector
      const hashIdx = sel.indexOf('#');
      const dotIdx = sel.indexOf('.', hashIdx);
      const hash = hashIdx > 0 ? hashIdx : sel.length;
      const dot = dotIdx > 0 ? dotIdx : sel.length;
      const tag = hashIdx !== -1 || dotIdx !== -1 ? sel.slice(0, Math.min(hash, dot)) : sel;
      const elm = vnode.elm = isDef(data) && isDef(i = (data as VNodeData).ns) ? api.createElementNS(i, tag)
                                                                               : api.createElement(tag);
      if (hash < dot) elm.setAttribute('id', sel.slice(hash + 1, dot));
      if (dotIdx > 0) elm.setAttribute('class', sel.slice(dot + 1).replace(/\./g, ' '));
      for (i = 0; i < cbs.create.length; ++i) cbs.create[i](emptyNode, vnode);
      if (is.array(children)) {
        for (i = 0; i < children.length; ++i) {
          const ch = children[i];
          if (ch != null) {
            api.appendChild(elm, createElm(ch as VNode, insertedVnodeQueue));
          }
        }
      } else if (is.primitive(vnode.text)) {
        api.appendChild(elm, api.createTextNode(vnode.text));
      }
      i = (vnode.data as VNodeData).hook; // Reuse variable
      if (isDef(i)) {
        if (i.create) i.create(emptyNode, vnode);
        if (i.insert) insertedVnodeQueue.push(vnode);
      }
    } else {
      vnode.elm = api.createTextNode(vnode.text as string);
    }
    return vnode.elm;
  }

  function addVnodes(parentElm: Node,
                     before: Node | null,
                     vnodes: Array<VNode>,
                     startIdx: number,
                     endIdx: number,
                     insertedVnodeQueue: VNodeQueue) {
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

          // 这个 listeners 有什么用？
          listeners = cbs.remove.length + 1;
          // 创建删除回调函数，延迟执行
          rm = createRmCb(ch.elm as Node, listeners);

          // 调用所有模块的 remove 钩子
          for (i = 0; i < cbs.remove.length; ++i) cbs.remove[i](ch, rm);

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

  function updateChildren(parentElm: Node,
                          oldCh: Array<VNode>,
                          newCh: Array<VNode>,
                          insertedVnodeQueue: VNodeQueue) {
    let oldStartIdx = 0, newStartIdx = 0;
    let oldEndIdx = oldCh.length - 1;
    let oldStartVnode = oldCh[0];
    let oldEndVnode = oldCh[oldEndIdx];
    let newEndIdx = newCh.length - 1;
    let newStartVnode = newCh[0];
    let newEndVnode = newCh[newEndIdx];
    let oldKeyToIdx: any;
    let idxInOld: number;
    let elmToMove: VNode;
    let before: any;

    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      if (oldStartVnode == null) {
        oldStartVnode = oldCh[++oldStartIdx]; // Vnode might have been moved left
      } else if (oldEndVnode == null) {
        oldEndVnode = oldCh[--oldEndIdx];
      } else if (newStartVnode == null) {
        newStartVnode = newCh[++newStartIdx];
      } else if (newEndVnode == null) {
        newEndVnode = newCh[--newEndIdx];
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue);
        oldStartVnode = oldCh[++oldStartIdx];
        newStartVnode = newCh[++newStartIdx];
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue);
        oldEndVnode = oldCh[--oldEndIdx];
        newEndVnode = newCh[--newEndIdx];
      } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue);
        api.insertBefore(parentElm, oldStartVnode.elm as Node, api.nextSibling(oldEndVnode.elm as Node));
        oldStartVnode = oldCh[++oldStartIdx];
        newEndVnode = newCh[--newEndIdx];
      } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue);
        api.insertBefore(parentElm, oldEndVnode.elm as Node, oldStartVnode.elm as Node);
        oldEndVnode = oldCh[--oldEndIdx];
        newStartVnode = newCh[++newStartIdx];
      } else {
        if (oldKeyToIdx === undefined) {
          oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx);
        }
        idxInOld = oldKeyToIdx[newStartVnode.key as string];
        if (isUndef(idxInOld)) { // New element
          api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm as Node);
          newStartVnode = newCh[++newStartIdx];
        } else {
          elmToMove = oldCh[idxInOld];
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
    if (oldStartIdx <= oldEndIdx || newStartIdx <= newEndIdx) {
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
          updateChildren(
            elm,
            oldCh as Array<VNode>,
            ch as Array<VNode>,
            insertedVnodeQueue
          );
      } else if (isDef(ch)) {
        // 新结点有子结点，旧结点没有子结点的情况
        if (isDef(oldVnode.text)) api.setTextContent(elm, '');
        addVnodes(elm, null, ch as Array<VNode>, 0, (ch as Array<VNode>).length - 1, insertedVnodeQueue);
      } else if (isDef(oldCh)) {
        // 旧结点有子结点，新结点没有子结点的情况
        removeVnodes(elm, oldCh as Array<VNode>, 0, (oldCh as Array<VNode>).length - 1);
      } else if (isDef(oldVnode.text)) {
        // 旧结点有文本结点，新结点没有文本结点的情况
        api.setTextContent(elm, '');
      }
    } else if (oldVnode.text !== vnode.text) {
      // 新旧结点的文本结点不一样
      if (isDef(oldCh)) {
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
