import React, { PureComponent, isValidElement, cloneElement, createRef } from 'react';
import { findDOMNode } from 'react-dom';
import ResizeObserver from 'resize-observer-polyfill';
import rafSchd from 'raf-schd';
import { bool, number, string, shape, func, any, node, oneOfType } from 'prop-types';

import { getHandle, isFunction, isSSR, isDOMElement } from 'lib/utils';

class ResizeDetector extends PureComponent {
  constructor(props) {
    super(props);

    const { skipOnMount, refreshMode, refreshRate, refreshOptions } = props;

    this.state = {
      width: undefined,
      height: undefined
    };

    this.skipOnMount = skipOnMount;
    this.raf = null;
    this.unmounted = false;
    this.targetRef = createRef();
    this.observableElement = null;

    const handle = getHandle(refreshMode);
    this.resizeHandler = handle
      ? handle(this.createResizeHandler, refreshRate, refreshOptions)
      : this.createResizeHandler;

    this.resizeObserver = new ResizeObserver(this.resizeHandler);
  }

  componentDidMount() {
    this.attachObserver();
  }

  componentDidUpdate() {
    this.attachObserver();
  }

  componentWillUnmount() {
    this.resizeObserver.disconnect();
    this.rafClean();
    this.cancelHandler();
    this.unmounted = true;
  }

  cancelHandler = () => {
    if (this.resizeHandler && this.resizeHandler.cancel) {
      // cancel debounced handler
      this.resizeHandler.cancel();
      this.resizeHandler = null;
    }
  };

  rafClean = () => {
    if (this.raf && this.raf.cancel) {
      this.raf.cancel();
      this.raf = null;
    }
  };

  attachObserver = () => {
    const { targetRef } = this.props;
    if (targetRef && targetRef.current) {
      this.targetRef.current = targetRef.current;
    }

    const element = this.getElement();
    if (!element) {
      // can't find element to observe
      return;
    }

    if (this.observableElement && this.observableElement === element) {
      // element is already observed
      return;
    }

    this.observableElement = element;
    this.resizeObserver.observe(element);
  };

  getElement = () => {
    const { querySelector, targetDomEl } = this.props;

    if (isSSR()) return undefined;

    // in case we pass a querySelector
    if (querySelector) return document.querySelector(querySelector);
    // in case we pass a DOM element
    if (targetDomEl && isDOMElement(targetDomEl)) return targetDomEl;
    // in case we pass a React ref using React.createRef()
    if (this.targetRef && isDOMElement(this.targetRef.current)) return this.targetRef.current;

    // the worse case when we don't receive any information from the parent and the library doesn't add any wrappers
    // we have to use a deprecated `findDOMNode` method in order to find a DOM element to attach to
    // eslint-disable-next-line react/no-find-dom-node
    const currentElement = findDOMNode(this);

    if (!currentElement) return undefined;

    const renderType = this.getRenderType();
    switch (renderType) {
      case 'renderProp':
        return currentElement;
      case 'childFunction':
        return currentElement;
      case 'child':
        return currentElement;
      case 'childArray':
        return currentElement;
      default:
        return currentElement.parentElement;
    }
  };

  createUpdater = () => {
    this.rafClean();

    this.raf = rafSchd(({ width, height }) => {
      const { onResize } = this.props;

      if (isFunction(onResize)) {
        onResize(width, height);
      }

      this.setState({ width, height });
    });

    return this.raf;
  };

  createResizeHandler = entries => {
    const { width: widthCurrent, height: heightCurrent } = this.state;
    const { handleWidth, handleHeight } = this.props;

    if (!handleWidth && !handleHeight) return;

    const updater = this.createUpdater();

    entries.forEach(entry => {
      const { width, height } = (entry && entry.contentRect) || {};

      const isWidthChanged = handleWidth && widthCurrent !== width;
      const isHeightChanged = handleHeight && heightCurrent !== height;
      const isSizeChanged = isWidthChanged || isHeightChanged;

      const shouldSetSize = !this.skipOnMount && isSizeChanged && !isSSR();
      if (shouldSetSize) {
        updater({ width, height });
      }

      this.skipOnMount = false;
    });
  };

  getRenderType = () => {
    const { render, children } = this.props;
    if (isFunction(render)) {
      // DEPRECATED. Use `Child Function Pattern` instead
      return 'renderProp';
    }

    if (isFunction(children)) {
      return 'childFunction';
    }

    if (isValidElement(children)) {
      return 'child';
    }

    if (Array.isArray(children)) {
      // DEPRECATED. Wrap children with a single parent
      return 'childArray';
    }

    // DEPRECATED. Use `Child Function Pattern` instead
    return 'parent';
  };

  render() {
    const { render, children, nodeType: WrapperTag } = this.props;
    const { width, height } = this.state;

    const childProps = { width, height };
    const renderType = this.getRenderType();

    switch (renderType) {
      case 'renderProp':
        return render(childProps);
      case 'childFunction':
        return children(childProps);
      case 'child':
        return cloneElement(children, childProps);
      case 'childArray':
        return children.map(el => !!el && cloneElement(el, childProps));
      default:
        return <WrapperTag />;
    }
  }
}

ResizeDetector.propTypes = {
  handleWidth: bool,
  handleHeight: bool,
  skipOnMount: bool,
  refreshRate: number,
  refreshMode: string,
  refreshOptions: shape({
    leading: bool,
    trailing: bool
  }),
  querySelector: string,
  targetDomEl: any, // eslint-disable-line react/forbid-prop-types
  targetRef: oneOfType([func, shape({ current: any })]),
  onResize: func,
  render: func,
  children: any, // eslint-disable-line react/forbid-prop-types
  nodeType: node
};

ResizeDetector.defaultProps = {
  handleWidth: true,
  handleHeight: true,
  skipOnMount: false,
  refreshRate: 1000,
  refreshMode: undefined,
  refreshOptions: undefined,
  querySelector: null,
  targetDomEl: null,
  targetRef: null,
  onResize: null,
  render: undefined,
  children: null,
  nodeType: 'div'
};

export default ResizeDetector;
