import '../polymer/polymer.js';
import '../iron-resizable-behavior/iron-resizable-behavior.js';
import { IronA11yKeysBehavior } from '../iron-a11y-keys-behavior/iron-a11y-keys-behavior.js';
import { IronControlState } from '../iron-behaviors/iron-control-state.js';
import { IronOverlayBehavior, IronOverlayBehaviorImpl } from '../iron-overlay-behavior/iron-overlay-behavior.js';
import { NeonAnimationRunnerBehavior } from '../neon-animation/neon-animation-runner-behavior.js';
import { IronDropdownScrollManager } from './iron-dropdown-scroll-manager.js';
import { Polymer } from '../polymer/lib/legacy/polymer-fn.js';
import { dom } from '../polymer/lib/legacy/polymer.dom.js';

Polymer({
  _template: `
    <style>
      :host {
        position: fixed;
      }

      #contentWrapper ::slotted(*) {
        overflow: auto;
      }

      #contentWrapper.animating ::slotted(*) {
        overflow: hidden;
      }
    </style>

    <div id="contentWrapper">
      <slot id="content" name="dropdown-content"></slot>
    </div>
`,

  is: 'iron-dropdown',

  behaviors: [
    IronControlState,
    IronA11yKeysBehavior,
    IronOverlayBehavior,
    NeonAnimationRunnerBehavior
  ],

  properties: {
    /**
     * The orientation against which to align the dropdown content
     * horizontally relative to the dropdown trigger.
     * Overridden from `Polymer.IronFitBehavior`.
     */
    horizontalAlign: {
      type: String,
      value: 'left',
      reflectToAttribute: true
    },

    /**
     * The orientation against which to align the dropdown content
     * vertically relative to the dropdown trigger.
     * Overridden from `Polymer.IronFitBehavior`.
     */
    verticalAlign: {
      type: String,
      value: 'top',
      reflectToAttribute: true
    },

    /**
     * An animation config. If provided, this will be used to animate the
     * opening of the dropdown. Pass an Array for multiple animations.
     * See `neon-animation` documentation for more animation configuration
     * details.
     */
    openAnimationConfig: {
      type: Object
    },

    /**
     * An animation config. If provided, this will be used to animate the
     * closing of the dropdown. Pass an Array for multiple animations.
     * See `neon-animation` documentation for more animation configuration
     * details.
     */
    closeAnimationConfig: {
      type: Object
    },

    /**
     * If provided, this will be the element that will be focused when
     * the dropdown opens.
     */
    focusTarget: {
      type: Object
    },

    /**
     * Set to true to disable animations when opening and closing the
     * dropdown.
     */
    noAnimations: {
      type: Boolean,
      value: false
    },

    /**
     * By default, the dropdown will constrain scrolling on the page
     * to itself when opened.
     * Set to true in order to prevent scroll from being constrained
     * to the dropdown when it opens.
     */
    allowOutsideScroll: {
      type: Boolean,
      value: false
    },

    /**
     * Callback for scroll events.
     * @type {Function}
     * @private
     */
    _boundOnCaptureScroll: {
      type: Function,
      value: function() {
        return this._onCaptureScroll.bind(this);
      }
    }
  },

  listeners: {
    'neon-animation-finish': '_onNeonAnimationFinish'
  },

  observers: [
    '_updateOverlayPosition(positionTarget, verticalAlign, horizontalAlign, verticalOffset, horizontalOffset)'
  ],

  /**
   * The element that is contained by the dropdown, if any.
   */
  get containedElement() {
    // Polymer 2.x returns slot.assignedNodes which can contain text nodes.
    var nodes = dom(this.$.content).getDistributedNodes();
    for (var i = 0, l = nodes.length; i < l; i++) {
      if (nodes[i].nodeType === Node.ELEMENT_NODE) {
        return nodes[i];
      }
    }
  },

  ready: function() {
    // Memoized scrolling position, used to block scrolling outside.
    this._scrollTop = 0;
    this._scrollLeft = 0;
    // Used to perform a non-blocking refit on scroll.
    this._refitOnScrollRAF = null;
  },

  attached: function () {
    if (!this.sizingTarget || this.sizingTarget === this) {
      this.sizingTarget = this.containedElement || this;
    }
  },

  detached: function() {
    this.cancelAnimation();
    document.removeEventListener('scroll', this._boundOnCaptureScroll);
    IronDropdownScrollManager.removeScrollLock(this);
  },

  /**
   * Called when the value of `opened` changes.
   * Overridden from `IronOverlayBehavior`
   */
  _openedChanged: function() {
    if (this.opened && this.disabled) {
      this.cancel();
    } else {
      this.cancelAnimation();
      this._updateAnimationConfig();
      this._saveScrollPosition();
      if (this.opened) {
        document.addEventListener('scroll', this._boundOnCaptureScroll);
        !this.allowOutsideScroll && IronDropdownScrollManager.pushScrollLock(this);
      } else {
        document.removeEventListener('scroll', this._boundOnCaptureScroll);
        IronDropdownScrollManager.removeScrollLock(this);
      }
      IronOverlayBehaviorImpl._openedChanged.apply(this, arguments);
    }
  },

  /**
   * Overridden from `IronOverlayBehavior`.
   */
  _renderOpened: function() {
    if (!this.noAnimations && this.animationConfig.open) {
      this.$.contentWrapper.classList.add('animating');
      this.playAnimation('open');
    } else {
      IronOverlayBehaviorImpl._renderOpened.apply(this, arguments);
    }
  },

  /**
   * Overridden from `IronOverlayBehavior`.
   */
  _renderClosed: function() {
    if (!this.noAnimations && this.animationConfig.close) {
      this.$.contentWrapper.classList.add('animating');
      this.playAnimation('close');
    } else {
      IronOverlayBehaviorImpl._renderClosed.apply(this, arguments);
    }
  },

  /**
   * Called when animation finishes on the dropdown (when opening or
   * closing). Responsible for "completing" the process of opening or
   * closing the dropdown by positioning it or setting its display to
   * none.
   */
  _onNeonAnimationFinish: function() {
    this.$.contentWrapper.classList.remove('animating');
    if (this.opened) {
      this._finishRenderOpened();
    } else {
      this._finishRenderClosed();
    }
  },

  _onCaptureScroll: function() {
    if (!this.allowOutsideScroll) {
      this._restoreScrollPosition();
    } else {
      this._refitOnScrollRAF && window.cancelAnimationFrame(this._refitOnScrollRAF);
      this._refitOnScrollRAF = window.requestAnimationFrame(this.refit.bind(this));
    }
  },

  /**
   * Memoizes the scroll position of the outside scrolling element.
   * @private
   */
  _saveScrollPosition: function() {
    if (document.scrollingElement) {
      this._scrollTop = document.scrollingElement.scrollTop;
      this._scrollLeft = document.scrollingElement.scrollLeft;
    } else {
      // Since we don't know if is the body or html, get max.
      this._scrollTop = Math.max(document.documentElement.scrollTop, document.body.scrollTop);
      this._scrollLeft = Math.max(document.documentElement.scrollLeft, document.body.scrollLeft);
    }
  },

  /**
   * Resets the scroll position of the outside scrolling element.
   * @private
   */
  _restoreScrollPosition: function() {
    if (document.scrollingElement) {
      document.scrollingElement.scrollTop = this._scrollTop;
      document.scrollingElement.scrollLeft = this._scrollLeft;
    } else {
      // Since we don't know if is the body or html, set both.
      document.documentElement.scrollTop = this._scrollTop;
      document.documentElement.scrollLeft = this._scrollLeft;
      document.body.scrollTop = this._scrollTop;
      document.body.scrollLeft = this._scrollLeft;
    }
  },

  /**
   * Constructs the final animation config from different properties used
   * to configure specific parts of the opening and closing animations.
   */
  _updateAnimationConfig: function() {
    // Update the animation node to be the containedElement.
    var animationNode = this.containedElement;
    var animations = [].concat(this.openAnimationConfig || []).concat(this.closeAnimationConfig || []);
    for (var i = 0; i < animations.length; i++) {
      animations[i].node = animationNode;
    }
    this.animationConfig = {
      open: this.openAnimationConfig,
      close: this.closeAnimationConfig
    };
  },

  /**
   * Updates the overlay position based on configured horizontal
   * and vertical alignment.
   */
  _updateOverlayPosition: function() {
    if (this.isAttached) {
      // This triggers iron-resize, and iron-overlay-behavior will call refit if needed.
      this.notifyResize();
    }
  },

  /**
   * Apply focus to focusTarget or containedElement
   */
  _applyFocus: function() {
    var focusTarget = this.focusTarget || this.containedElement;
    if (focusTarget && this.opened && !this.noAutoFocus) {
      focusTarget.focus();
    } else {
      IronOverlayBehaviorImpl._applyFocus.apply(this, arguments);
    }
  }
});
