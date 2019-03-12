import {Hooks} from './hooks';
import {AttachData} from './helpers/attachto'
import {VNodeStyle} from './modules/style'
import {On} from './modules/eventlisteners'
import {Attrs} from './modules/attributes'
import {Classes} from './modules/class'
import {Props} from './modules/props'
import {Dataset} from './modules/dataset'
import {Hero} from './modules/hero'

// key 值为 string 或 number 类型
export type Key = string | number;

/**
 * 定义 VNode 类型
 */
export interface VNode {
  // 选择器
  sel: string | undefined;
  // 结点数据，具体看 VNodeData
  data: VNodeData | undefined;
  // 子结点
  children: Array<VNode | string> | undefined;
  // 关联的原生结点
  elm: Node | undefined;
  // 文本
  text: string | undefined;
  // 唯一值，做性能优化用
  key: Key | undefined;
}

/**
 * 定义 VNodeData 类型
 */
export interface VNodeData {
  // 属性
  props?: Props;
  // 属性
  attrs?: Attrs;
  // 样式类
  class?: Classes;
  // 样式
  style?: VNodeStyle;
  // 数据
  dataset?: Dataset;
  // 绑定的事件
  on?: On;
  hero?: Hero;
  attachData?: AttachData;
  // 钩子
  hook?: Hooks;
  // 唯一值
  key?: Key;
  ns?: string; // for SVGs
  fn?: () => VNode; // for thunks
  args?: Array<any>; // for thunks
  [key: string]: any; // for any other 3rd party module
}

// 暴露 vnode 对象函数
export function vnode(
  sel: string | undefined,
  data: any | undefined,
  children: Array<VNode | string> | undefined,
  text: string | undefined,
  elm: Element | Text | undefined
): VNode {
  // key 为结点数据 data 中的 key，
  let key = data === undefined ? undefined : data.key;
  return {
    sel: sel,
    data: data, 
    children: children,
    text: text, 
    elm: elm, 
    key: key
  };
}

export default vnode;
