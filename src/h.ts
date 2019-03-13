// 导入 VNode、VNodeData interface 和 vnode 对象函数
import {vnode, VNode, VNodeData} from './vnode';
// VNode 数组
export type VNodes = Array<VNode>;
export type VNodeChildElement = VNode | string | number | undefined | null;
export type ArrayOrElement<T> = T | T[];
export type VNodeChildren = ArrayOrElement<VNodeChildElement>
import * as is from './is';

function addNS(data: any, children: VNodes | undefined, sel: string | undefined): void {
  data.ns = 'http://www.w3.org/2000/svg';
  if (sel !== 'foreignObject' && children !== undefined) {
    for (let i = 0; i < children.length; ++i) {
      let childData = children[i].data;
      if (childData !== undefined) {
        addNS(childData, (children[i] as VNode).children as VNodes, children[i].sel);
      }
    }
  }
}

// ts 函数重载声明和具体实现
export function h(sel: string): VNode;  // 只有选择器
export function h(sel: string, data: VNodeData): VNode; // 选择器和结点数据
export function h(sel: string, children: VNodeChildren): VNode; // 选择器和子结点
export function h(sel: string, data: VNodeData, children: VNodeChildren): VNode; // 选择器、结点数据和子结点
export function h(sel: any, b?: any, c?: any): VNode {  // 具体实现
  /**
   * children 和 text 不可同时存在
   */
  var data: VNodeData = {},
      children: any,
      text: any,
      i: number;

  // 处理参数
  if (c !== undefined) {
    // 三个参数的情况：sel、data、children
    data = b;
    // 检测第三个参数的类型，做相关赋值
    if (is.array(c)) {
      // c 是数组
      children = c;
    } else if (is.primitive(c)) { 
      // c 是 string 或 number
      text = c;
    } else if (c && c.sel) {
      // c 存在 sel 属性
      children = [c];
    }
  } else if (b !== undefined) {
    // 两个参数的情况：sel、data | children，基本同上
    if (is.array(b)) { 
      children = b; 
    } else if (is.primitive(b)) { 
      text = b;
    } else if (b && b.sel) { 
      children = [b]; 
    } else { 
      // b 为结点数据
      data = b;
    }
  }

  // 将 string | number 类型的子结点转为 vnode 对象
  if (children !== undefined) {
    for (i = 0; i < children.length; ++i) {
      if (is.primitive(children[i])) 
        children[i] = vnode(undefined, undefined, undefined, children[i], undefined);
    }
  }

  // 处理 svg
  if (
    sel[0] === 's' && 
    sel[1] === 'v' && 
    sel[2] === 'g' &&
    (sel.length === 3 || sel[3] === '.' || sel[3] === '#')
  ) {
    // 加上特殊的 namespaces
    addNS(data, children, sel);
  }

  // 生成 vnode
  return vnode(sel, data, children, text, undefined);
};

export default h;
