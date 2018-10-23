import { PolymerElement, html } from '@polymer/polymer';
import afterNextRender from '../../shared/afterNextRender';
import * as Gestures from '@polymer/polymer/lib/utils/gestures';

export default class PickerViewColumn extends PolymerElement {
  static get is() {
    return 'a-picker-view-column';
  }

  static get properties() {
    return {
      value: {
        type: String,
        reflectToAttribute: true,
        value: ''
      },
      selectedIndex: {
        type: Number,
        reflectToAttribute: true,
        value: 0,
        observer: '_selectedIndexChange'
      },
      indicatorStyle: {
        type: String,
        value: ''
      },
      maskStyle: {
        type: String,
        value: ''
      },
      contentStyle: {
        type: String,
        value: ''
      }
    };
  }

  itemHeight = 0;
  scrollY = 0;
  lastY = 0;
  lastTime = 0;
  velocity = 0;
  acceleration = -100;
  timer = null;
  isMoving = false;
  touchMove = false;

  constructor() {
    super();
  }

  ready() {
    super.ready();
    afterNextRender(this, () => {
      this.itemHeight = this.$.indicator.offsetHeight;
      this._updateDynamicStyle();
      /**
       * However, the observer func is executed earlier than ready,
       * dom hasn't been rendered，
       * so I execute the first _selectedIndexChange func in ready，
       * to ensure that the dom has been rendered
       */
      this._selectedIndexChange(this.selectedIndex, null);
      /**
       * In Gestures listener callback, 'this' is the listener target
       */
      Gestures.addListener(this, 'track', this.handleTrack);
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    Gestures.removeListener(this, 'track', this.handleTrack);
  }

  _selectedIndexChange(newIndex, oldIndex) {
    if (oldIndex !== undefined) {
      if (this.isMoving) return;
      let itemCount = this.children.length;
      if (newIndex >= itemCount) {
        this.selectedIndex = newIndex = itemCount - 1;
      }
      this._scrollTo(this.itemHeight * newIndex, 0.3);
    }
  }

  handleTrack = (e) => {
    const { detail } = e;
    if (detail.state === 'start') {
      const { dx, dy, y } = detail;
      const direction = Math.abs(dy) - Math.abs(dx);
      if (direction > 0) {
        this._stopScroll();
        this.isMoving = true;
        this.lastTime = +new Date();
        this.lastY = y;
        this.addEventListener('touchmove', this._onMove);
        this.addEventListener('touchend', this._onEnd);
        e.stopPropagation();
      }
    }
  }

  _onMove(e) {
    e.preventDefault();
    let now = +new Date();
    let { lastY, lastTime } = this;
    let nowY = e.touches[0].clientY;
    let offset = nowY - lastY;
    let duration = now - lastTime;
    let scrollY = this.scrollY - offset;
    this._scrollTo(scrollY, 0);
    this.lastY = nowY;
    this.velocity = duration ? -offset / duration * 1000 : this.velocity;
    this.touchMove = true;
    e.stopPropagation();
  }

  _onEnd(e) {
    let { itemHeight, scrollY, velocity, acceleration, touchMove } = this;
    let maxScrollY = (this.children.length - 1) * itemHeight;
    let time = 0.3;
    // handle no touchmove
    if (!touchMove) {
      let rectY = this.$.indicator.getBoundingClientRect().top;
      let touchY = e.changedTouches[0].clientY;
      scrollY = scrollY + touchY - rectY - itemHeight;
      scrollY = Math.round(scrollY / itemHeight) * itemHeight;
      this._scrollTo(scrollY, time);
      return;
    } else {
      this.touchMove = false;
    }

    // handle touchmove over start or end
    if (scrollY < 0 || scrollY > maxScrollY) {
      scrollY = Math.max(scrollY, 0);
      scrollY = Math.min(scrollY, maxScrollY);
      this._scrollTo(scrollY, time);
      return;
    }

    time = Math.abs(velocity / acceleration);
    let mayScrollY = scrollY + velocity / 2 * time; // S1 = S0 + 1/2vt
    mayScrollY = Math.round(mayScrollY / itemHeight) * itemHeight;
    let shift;

    if (mayScrollY < 0) {
      shift = scrollY;
      scrollY = 0;
    } else if (mayScrollY > maxScrollY) {
      shift = maxScrollY - scrollY;
      scrollY = maxScrollY;
    } else {
      scrollY = mayScrollY;
    }

    if (mayScrollY < 0 || mayScrollY > maxScrollY) {
      velocity = Math.abs(velocity);
      // S = vt + 1/2at^2 => t = ~
      time =
        (Math.sqrt(2 * acceleration * shift + velocity * velocity) - velocity) /
        acceleration;
      time = Math.abs(time);
    }
    this._scrollTo(scrollY, time);
    this.removeEventListener('touchmove', this._onMove);
    this.removeEventListener('touchend', this._onEnd);
    e.stopPropagation();
  }

  _updateDynamicStyle() {
    let padding = (this.offsetHeight - this.itemHeight) / 2;
    this.maskStyle = `background-size: 100% ${padding}px;`;
    this.contentStyle = `padding: ${padding}px 0;`;
  }

  _setTransform(value) {
    this.$.content.style.transform = value;
    this.$.content.style.webkitTransform = value;
  }

  _setTransition(value) {
    this.$.content.style.transition = value;
    this.$.content.style.webkitTransition = value;
  }

  _scrollTo(y, time = 0.3) {
    if (this.scrollY === y) return;

    this.scrollY = y;

    if (time) {
      this._setTransition(`cubic-bezier(0, 0, 0.2, 1.15) ${time}s`);
    }

    this._setTransform(`translate3d(0, ${-y}px, 0)`);
    if (time) {
      this.timer = setTimeout(() => {
        this._setTransition('');
        this._updateSelectedItem();
        this.isMoving = false;
      }, +time * 1000);
    }
  }

  _stopScroll() {
    let { content } = this.$;
    let transform =
      this.$.content.style.transform || this.$.content.style.webkitTransform;
    if (transform === '') return;
    let matrix = transform.replace(/[^0-9.,]/g, '').split(',');
    let scrollY = Number(matrix[1]);
    this.velocity = 0;
    this._setTransition('');
    this._scrollTo(scrollY, 0);
    this.isMoving = false;
    clearTimeout(this.timer);
  }

  _updateSelectedItem() {
    let { scrollY, itemHeight } = this;
    let i = Math.round(scrollY / itemHeight);
    if (this.selectedIndex === i) return;
    this.selectedIndex = i;
    let item = this.children[i];
    if (item) {
      this.value = item.getAttribute('value') || '';
    } else {
      console.warn(`picker-view child item ${i} not found.`, this.children);
    }
    this._dispatchEvent('_columnChange');
  }

  /**
   * Called from parent picker-view
   * to update indicator style
   */
  _updateStyleFromParent(indicatorStyle) {
    this.indicatorStyle = indicatorStyle;
  }

  _dispatchEvent(name) {
    let { selectedIndex, value } = this;
    this.dispatchEvent(
      new CustomEvent(name, {
        detail: {
          selectedIndex,
          value
        },
        bubbles: true,
        cancelable: false
      })
    );
  }

  static get template() {
    return html`
      <div id="mask" class="mask" style$="{{maskStyle}}">
        <div id="indicator" class="indicator" style$="{{indicatorStyle}}"></div>
      </div>
      <div id="content" class="content" style$="{{contentStyle}}">
        <slot></slot>
      </div>
      <style>
        :host {
          flex: 1;
          -webkit-flex: 1;
          height: 100%;
          overflow: hidden;
          position: relative;
        }
  
        .mask {
          position: absolute;
          left: 0;
          top: 0;
          z-index: 2;
          width: 100%;
          height: 100%;
          display: flex;
          display: -webkit-flex;
          flex-flow: column nowrap;
          -webkit-flex-flow: column nowrap;
          align-items: center;
          -webkit-align-items: center;
          justify-content: center;
          -webkit-justify-content: center;
          background-image:
            linear-gradient(to bottom, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.7)),
            linear-gradient(to top, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.7));
          background-position: top, bottom;
          background-repeat: no-repeat;
          background-size: 100% 45%;
        }
  
        .indicator {
          box-sizing: border-box;
          width: 100%;
          height: 40px;
          border-top: 1px solid #ddd;
          border-bottom: 1px solid #ddd;
        }
  
        .content ::slotted(a-view) {
          height: 40px;
          line-height: 40px;
          font-size: 16px;
          color: #333;
        }
      </style>
    `;
  }
}

customElements.define(PickerViewColumn.is, PickerViewColumn);