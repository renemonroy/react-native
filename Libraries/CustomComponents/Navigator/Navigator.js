/**
 * Copyright (c) 2015, Facebook, Inc.  All rights reserved.
 *
 * Facebook, Inc. (“Facebook”) owns all right, title and interest, including
 * all intellectual property and other proprietary rights, in and to the React
 * Native CustomComponents software (the “Software”).  Subject to your
 * compliance with these terms, you are hereby granted a non-exclusive,
 * worldwide, royalty-free copyright license to (1) use and copy the Software;
 * and (2) reproduce and distribute the Software as part of your own software
 * (“Your Software”).  Facebook reserves all rights not expressly granted to
 * you in this license agreement.
 *
 * THE SOFTWARE AND DOCUMENTATION, IF ANY, ARE PROVIDED "AS IS" AND ANY EXPRESS
 * OR IMPLIED WARRANTIES (INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 * OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE) ARE DISCLAIMED.
 * IN NO EVENT SHALL FACEBOOK OR ITS AFFILIATES, OFFICERS, DIRECTORS OR
 * EMPLOYEES BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
 * OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 * WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR
 * OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THE SOFTWARE, EVEN IF
 * ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * @providesModule Navigator
 */
 /* eslint-disable no-extra-boolean-cast*/
'use strict';

var AnimationsDebugModule = require('NativeModules').AnimationsDebugModule;
var BackAndroid = require('BackAndroid');
var Dimensions = require('Dimensions');
var InteractionMixin = require('InteractionMixin');
var NavigatorBreadcrumbNavigationBar = require('NavigatorBreadcrumbNavigationBar');
var NavigatorInterceptor = require('NavigatorInterceptor');
var NavigatorNavigationBar = require('NavigatorNavigationBar');
var NavigatorSceneConfigs = require('NavigatorSceneConfigs');
var NavigatorStaticContextContainer = require('NavigatorStaticContextContainer');
var PanResponder = require('PanResponder');
var Platform = require('Platform');
var React = require('React');
var StaticContainer = require('StaticContainer.react');
var StyleSheet = require('StyleSheet');
var Subscribable = require('Subscribable');
var TimerMixin = require('react-timer-mixin');
var View = require('View');

var clamp = require('clamp');
var flattenStyle = require('flattenStyle');
var getNavigatorContext = require('getNavigatorContext');
var invariant = require('invariant');
var rebound = require('rebound');

var PropTypes = React.PropTypes;

// TODO: this is not ideal because there is no guarantee that the navigator
// is full screen, hwoever we don't have a good way to measure the actual
// size of the navigator right now, so this is the next best thing.
var SCREEN_WIDTH = Dimensions.get('window').width;
var SCREEN_HEIGHT = Dimensions.get('window').height;
var SCENE_DISABLED_NATIVE_PROPS = {
  style: {
    left: SCREEN_WIDTH,
    opacity: 0,
  },
};

var __uid = 0;
function getuid() {
  return __uid++;
}

// styles moved to the top of the file so getDefaultProps can refer to it
var styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  defaultSceneStyle: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
  },
  baseScene: {
    position: 'absolute',
    overflow: 'hidden',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
  },
  disabledScene: {
    left: SCREEN_WIDTH,
  },
  transitioner: {
    flex: 1,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  }
});

var GESTURE_ACTIONS = [
  'pop',
  'jumpBack',
  'jumpForward',
];

/**
 * Use `Navigator` to transition between different scenes in your app. To
 * accomplish this, provide route objects to the navigator to identify each
 * scene, and also a `renderScene` function that the navigator can use to
 * render the scene for a given route.
 *
 * To change the animation or gesture properties of the scene, provide a
 * `configureScene` prop to get the config object for a given route. See
 * `Navigator.SceneConfigs` for default animations and more info on
 * scene config options.
 *
 * ### Basic Usage
 *
 * ```
 *   <Navigator
 *     initialRoute={{name: 'My First Scene', index: 0}}
 *     renderScene={(route, navigator) =>
 *       <MySceneComponent
 *         name={route.name}
 *         onForward={() => {
 *           var nextIndex = route.index + 1;
 *           navigator.push({
 *             name: 'Scene ' + nextIndex,
 *             index: nextIndex,
 *           });
 *         }}
 *         onBack={() => {
 *           if (route.index > 0) {
 *             navigator.pop();
 *           }
 *         }}
 *       />
 *     }
 *   />
 * ```
 *
 * ### Navigator Methods
 *
 * If you have a ref to the Navigator element, you can invoke several methods
 * on it to trigger navigation:
 *
 *  - `getCurrentRoutes()` - returns the current list of routes
 *  - `jumpBack()` - Jump backward without unmounting the current scene
 *  - `jumpForward()` - Jump forward to the next scene in the route stack
 *  - `jumpTo(route)` - Transition to an existing scene without unmounting
 *  - `push(route)` - Navigate forward to a new scene, squashing any scenes
 *     that you could `jumpForward` to
 *  - `pop()` - Transition back and unmount the current scene
 *  - `replace(route)` - Replace the current scene with a new route
 *  - `replaceAtIndex(route, index)` - Replace a scene as specified by an index
 *  - `replacePrevious(route)` - Replace the previous scene
 *  - `immediatelyResetRouteStack(routeStack)` - Reset every scene with an
 *     array of routes
 *  - `popToRoute(route)` - Pop to a particular scene, as specified by it's
 *     route. All scenes after it will be unmounted
 *  - `popToTop()` - Pop to the first scene in the stack, unmounting every
 *     other scene
 *
 * ### Navigation Context
 *
 * The navigator context object is made available to scenes through the
 * `renderScene` function. Alternatively, any scene or component inside a
 * Navigator can get the navigation context by calling
 * `Navigator.getContext(this)`.
 *
 * Unlike the Navigator methods, the functions in navigation context do not
 * directly control a specific navigator. Instead, the navigator context allows
 * a scene to request navigation from its parents. Navigation requests will
 * travel up through the hierarchy of Navigators, and will be resolved by the
 * deepest active navigator.
 *
 * Navigation context objects contain the following:
 *
 *  - `getCurrentRoutes()` - returns the routes for the closest navigator
 *  - `jumpBack()` - Jump backward without unmounting the current scene
 *  - `jumpForward()` - Jump forward to the next scene in the route stack
 *  - `jumpTo(route)` - Transition to an existing scene without unmounting
 *  - `parentNavigator` - a refrence to the parent navigation context
 *  - `push(route)` - Navigate forward to a new scene, squashing any scenes
 *     that you could `jumpForward` to
 *  - `pop()` - Transition back and unmount the current scene
 *  - `replace(route)` - Replace the current scene with a new route
 *  - `replaceAtIndex(route, index)` - Replace a scene as specified by an index
 *  - `replacePrevious(route)` - Replace the previous scene
 *  - `route` - The route that was used to render the scene with this context
 *  - `immediatelyResetRouteStack(routeStack)` - Reset every scene with an
 *     array of routes
 *  - `popToRoute(route)` - Pop to a particular scene, as specified by it's
 *     route. All scenes after it will be unmounted
 *  - `popToTop()` - Pop to the first scene in the stack, unmounting every
 *     other scene
 *
 */
var Navigator = React.createClass({

  propTypes: {
    /**
     * Optional function that allows configuration about scene animations and
     * gestures. Will be invoked with the route and should return a scene
     * configuration object
     *
     * ```
     * (route) => Navigator.SceneConfigs.FloatFromRight
     * ```
     */
    configureScene: PropTypes.func,

    /**
     * Required function which renders the scene for a given route. Will be
     * invoked with the route and the navigator object
     *
     * ```
     * (route, navigator) =>
     *   <MySceneComponent title={route.title} />
     * ```
     */
    renderScene: PropTypes.func.isRequired,

    /**
     * Specify a route to start on. A route is an object that the navigator
     * will use to identify each scene to render. `initialRoute` must be
     * a route in the `initialRouteStack` if both props are provided. The
     * `initialRoute` will default to the last item in the `initialRouteStack`.
     */
    initialRoute: PropTypes.object,

    /**
     * Provide a set of routes to initially mount. Required if no initialRoute
     * is provided. Otherwise, it will default to an array containing only the
     * `initialRoute`
     */
    initialRouteStack: PropTypes.arrayOf(PropTypes.object),

    /**
     * Will emit the target route upon mounting and before each nav transition
     */
    onWillFocus: PropTypes.func,

    /**
     * Will be called with the new route of each scene after the transition is
     * complete or after the initial mounting
     */
    onDidFocus: PropTypes.func,

    /**
     * Will be called with (ref, indexInStack, route) when the scene ref changes
     */
    onItemRef: PropTypes.func,

    /**
     * Optionally provide a navigation bar that persists across scene
     * transitions
     */
    navigationBar: PropTypes.node,

    /**
     * Optionally provide the navigator object from a parent Navigator
     */
    navigator: PropTypes.object,

    /**
     * Styles to apply to the container of each scene
     */
    sceneStyle: View.propTypes.style,
  },

  contextTypes: {
    // TODO (t6707746) Re-enable this when owner context switches to parent context
    // navigator: PropTypes.object,
  },

  statics: {
    BreadcrumbNavigationBar: NavigatorBreadcrumbNavigationBar,
    NavigationBar: NavigatorNavigationBar,
    SceneConfigs: NavigatorSceneConfigs,
    Interceptor: NavigatorInterceptor,
    getContext: getNavigatorContext,
  },

  mixins: [TimerMixin, InteractionMixin, Subscribable.Mixin],

  getDefaultProps: function() {
    return {
      configureScene: () => NavigatorSceneConfigs.PushFromRight,
      sceneStyle: styles.defaultSceneStyle,
    };
  },

  getInitialState: function() {
    var routeStack = this.props.initialRouteStack || [this.props.initialRoute];
    invariant(
      routeStack.length >= 1,
      'Navigator requires props.initialRoute or props.initialRouteStack.'
    );
    var initialRouteIndex = routeStack.length - 1;
    if (this.props.initialRoute) {
      initialRouteIndex = routeStack.indexOf(this.props.initialRoute);
      invariant(
        initialRouteIndex !== -1,
        'initialRoute is not in initialRouteStack.'
      );
    }
    return {
      sceneConfigStack: routeStack.map(
        (route) => this.props.configureScene(route)
      ),
      idStack: routeStack.map(() => getuid()),
      routeStack,
      // `updatingRange*` allows us to only render the visible or staged scenes
      // On first render, we will render every scene in the initialRouteStack
      updatingRangeStart: 0,
      updatingRangeLength: routeStack.length,
      presentedIndex: initialRouteIndex,
      transitionFromIndex: null,
      activeGesture: null,
      pendingGestureProgress: null,
      transitionQueue: [],
    };
  },

  componentWillMount: function() {
    this.parentNavigator = getNavigatorContext(this) || this.props.navigator;
    this._subRouteFocus = [];
    this.navigatorContext = {
      // Actions for child navigators or interceptors:
      setHandlerForIndex: this.setHandlerForIndex,
      request: this.request,

      // Contextual utilities
      parentNavigator: this.parentNavigator,
      getCurrentRoutes: this.getCurrentRoutes,
      // `route` is injected by NavigatorStaticContextContainer

      // Contextual nav action
      pop: this.requestPop,

      jumpBack: this.jumpBack,
      jumpForward: this.jumpForward,
      jumpTo: this.jumpTo,
      popToRoute: this.popToRoute,
      push: this.push,
      replace: this.replace,
      replaceAtIndex: this.replaceAtIndex,
      replacePrevious: this.replacePrevious,
      replacePreviousAndPop: this.replacePreviousAndPop,
      immediatelyResetRouteStack: this.immediatelyResetRouteStack,
      resetTo: this.resetTo,
      popToTop: this.popToTop,
    };
    this._handlers = {};
    this.springSystem = new rebound.SpringSystem();
    this.spring = this.springSystem.createSpring();
    this.spring.setRestSpeedThreshold(0.05);
    this.spring.setCurrentValue(0).setAtRest();
    this.spring.addListener({
      onSpringEndStateChange: () => {
        if (!this._interactionHandle) {
          this._interactionHandle = this.createInteractionHandle();
        }
      },
      onSpringUpdate: () => {
        this._handleSpringUpdate();
      },
      onSpringAtRest: () => {
        this._completeTransition();
      },
    });
    this.panGesture = PanResponder.create({
      onMoveShouldSetPanResponder: this._handleMoveShouldSetPanResponder,
      onPanResponderGrant: this._handlePanResponderGrant,
      onPanResponderRelease: this._handlePanResponderRelease,
      onPanResponderMove: this._handlePanResponderMove,
      onPanResponderTerminate: this._handlePanResponderTerminate,
    });
    this._itemRefs = {};
    this._interactionHandle = null;
    this._emitWillFocus(this.state.routeStack[this.state.presentedIndex]);
  },

  request: function(action, arg1, arg2) {
    if (this.parentNavigator) {
      return this.parentNavigator.request.apply(null, arguments);
    }
    return this._handleRequest.apply(null, arguments);
  },

  requestPop: function(popToBeforeRoute) {
    return this.request('pop', popToBeforeRoute);
  },

  requestPopTo: function(route) {
    return this.request('popTo', route);
  },

  _handleRequest: function(action, arg1, arg2) {
    var childHandler = this._handlers[this.state.presentedIndex];
    if (childHandler && childHandler(action, arg1, arg2)) {
      return true;
    }
    switch (action) {
      case 'pop':
        return this._handlePop(arg1);
      case 'push':
        return this._handlePush(arg1);
      default:
        invariant(false, 'Unsupported request type ' + action);
        return false;
    }
  },

  _handlePop: function(popToBeforeRoute) {
    if (popToBeforeRoute) {
      var popToBeforeRouteIndex = this.state.routeStack.indexOf(popToBeforeRoute);
      if (popToBeforeRouteIndex === -1) {
        return false;
      }
      invariant(
        popToBeforeRouteIndex <= this.state.presentedIndex,
        'Cannot pop past a route that is forward in the navigator'
      );
      this._popN(this.state.presentedIndex - popToBeforeRouteIndex + 1);
      return true;
    }
    if (this.state.presentedIndex === 0) {
      return false;
    }
    this.pop();
    return true;
  },

  _handlePush: function(route) {
    this.push(route);
    return true;
  },

  setHandlerForIndex: function(index, handler) {
    this._handlers[index] = handler;
  },

  componentDidMount: function() {
    this._handleSpringUpdate();
    this._emitDidFocus(this.state.routeStack[this.state.presentedIndex]);
    if (this.parentNavigator) {
      this.parentNavigator.setHandler(this._handleRequest);
    } else if (Platform.OS === 'android') {
      // There is no navigator in our props or context, so this is the
      // top-level navigator. We will handle back button presses here
      BackAndroid.addEventListener('hardwareBackPress', this._handleAndroidBackPress);
    }
  },

  componentWillUnmount: function() {
    if (this.parentNavigator) {
      this.parentNavigator.setHandler(null);
    } else if (Platform.OS === 'android') {
      BackAndroid.removeEventListener('hardwareBackPress', this._handleAndroidBackPress);
    }
  },

  _handleAndroidBackPress: function() {
    var didPop = this.requestPop();
    if (!didPop) {
      BackAndroid.exitApp();
    }
  },

  /**
   * @param {RouteStack} nextRouteStack Next route stack to reinitialize. This
   * doesn't accept stack item `id`s, which implies that all existing items are
   * destroyed, and then potentially recreated according to `routeStack`. Does
   * not animate, immediately replaces and rerenders navigation bar and stack
   * items.
   */
  immediatelyResetRouteStack: function(nextRouteStack) {
    var destIndex = nextRouteStack.length - 1;
    this.setState({
      idStack: nextRouteStack.map(getuid),
      routeStack: nextRouteStack,
      sceneConfigStack: nextRouteStack.map(
        this.props.configureScene
      ),
      updatingRangeStart: 0,
      updatingRangeLength: nextRouteStack.length,
      presentedIndex: destIndex,
      activeGesture: null,
      transitionFromIndex: null,
      transitionQueue: [],
    }, () => {
      this._handleSpringUpdate();
    });
  },

  _transitionTo: function(destIndex, velocity, jumpSpringTo, cb) {
    if (destIndex === this.state.presentedIndex) {
      return;
    }
    if (this.state.transitionFromIndex !== null) {
      this.state.transitionQueue.push({
        destIndex,
        velocity,
        cb,
      });
      return;
    }
    this.state.transitionFromIndex = this.state.presentedIndex;
    this.state.presentedIndex = destIndex;
    this.state.transitionCb = cb;
    this._onAnimationStart();
    if (AnimationsDebugModule) {
      AnimationsDebugModule.startRecordingFps();
    }
    var sceneConfig = this.state.sceneConfigStack[this.state.transitionFromIndex] ||
      this.state.sceneConfigStack[this.state.presentedIndex];
    invariant(
      sceneConfig,
      'Cannot configure scene at index ' + this.state.transitionFromIndex
    );
    if (jumpSpringTo != null) {
      this.spring.setCurrentValue(jumpSpringTo);
    }
    this.spring.setOvershootClampingEnabled(true);
    this.spring.getSpringConfig().friction = sceneConfig.springFriction;
    this.spring.getSpringConfig().tension = sceneConfig.springTension;
    this.spring.setVelocity(velocity || sceneConfig.defaultTransitionVelocity);
    this.spring.setEndValue(1);
    var willFocusRoute = this._subRouteFocus[this.state.presentedIndex] || this.state.routeStack[this.state.presentedIndex];
    this._emitWillFocus(willFocusRoute);
  },

  /**
   * This happens for each frame of either a gesture or a transition. If both are
   * happening, we only set values for the transition and the gesture will catch up later
   */
  _handleSpringUpdate: function() {
    // Prioritize handling transition in progress over a gesture:
    if (this.state.transitionFromIndex != null) {
      this._transitionBetween(
        this.state.transitionFromIndex,
        this.state.presentedIndex,
        this.spring.getCurrentValue()
      );
    } else if (this.state.activeGesture != null) {
      var presentedToIndex = this.state.presentedIndex + this._deltaForGestureAction(this.state.activeGesture);
      if (presentedToIndex > -1) {
        this._transitionBetween(
          this.state.presentedIndex,
          presentedToIndex,
          this.spring.getCurrentValue()
        );
      }
    }
  },

  /**
   * This happens at the end of a transition started by transitionTo, and when the spring catches up to a pending gesture
   */
  _completeTransition: function() {
    if (this.spring.getCurrentValue() !== 1 && this.spring.getCurrentValue() !== 0) {
      // The spring has finished catching up to a gesture in progress. Remove the pending progress
      // and we will be in a normal activeGesture state
      if (this.state.pendingGestureProgress) {
        this.state.pendingGestureProgress = null;
      }
      return;
    }
    this._onAnimationEnd();
    var presentedIndex = this.state.presentedIndex;
    var didFocusRoute = this._subRouteFocus[presentedIndex] || this.state.routeStack[presentedIndex];
    this._emitDidFocus(didFocusRoute);
    if (AnimationsDebugModule) {
      AnimationsDebugModule.stopRecordingFps(Date.now());
    }
    this.state.transitionFromIndex = null;
    this.spring.setCurrentValue(0).setAtRest();
    this._hideScenes();
    if (this.state.transitionCb) {
      this.state.transitionCb();
      this.state.transitionCb = null;
    }
    if (this._interactionHandle) {
      this.clearInteractionHandle(this._interactionHandle);
      this._interactionHandle = null;
    }
    if (this.state.pendingGestureProgress) {
      // A transition completed, but there is already another gesture happening.
      // Enable the scene and set the spring to catch up with the new gesture
      var gestureToIndex = this.state.presentedIndex + this._deltaForGestureAction(this.state.activeGesture);
      this._enableScene(gestureToIndex);
      this.spring.setEndValue(this.state.pendingGestureProgress);
      return;
    }
    if (this.state.transitionQueue.length) {
      var queuedTransition = this.state.transitionQueue.shift();
      this._enableScene(queuedTransition.destIndex);
      this._transitionTo(
        queuedTransition.destIndex,
        queuedTransition.velocity,
        null,
        queuedTransition.cb
      );
    }
  },

  _emitDidFocus: function(route) {
    if (this._lastDidFocus === route) {
      return;
    }
    this._lastDidFocus = route;
    if (this.props.onDidFocus) {
      this.props.onDidFocus(route);
    }
    if (this.parentNavigator && this.parentNavigator.onDidFocus) {
      this.parentNavigator.onDidFocus(route);
    }
  },

  _emitWillFocus: function(route) {
    if (this._lastWillFocus === route) {
      return;
    }
    this._lastWillFocus = route;
    var navBar = this._navBar;
    if (navBar && navBar.handleWillFocus) {
      navBar.handleWillFocus(route);
    }
    if (this.props.onWillFocus) {
      this.props.onWillFocus(route);
    }
    if (this.parentNavigator && this.parentNavigator.onWillFocus) {
      this.parentNavigator.onWillFocus(route);
    }
  },

  /**
   * Hides all scenes that we are not currently on, gesturing to, or transitioning from
   */
  _hideScenes: function() {
    var gesturingToIndex = null;
    if (this.state.activeGesture) {
      gesturingToIndex = this.state.presentedIndex + this._deltaForGestureAction(this.state.activeGesture);
    }
    for (var i = 0; i < this.state.routeStack.length; i++) {
      if (i === this.state.presentedIndex ||
          i === this.state.transitionFromIndex ||
          i === gesturingToIndex) {
        continue;
      }
      this._disableScene(i);
    }
  },

  /**
   * Push a scene off the screen, so that opacity:0 scenes will not block touches sent to the presented scenes
   */
  _disableScene: function(sceneIndex) {
    this.refs['scene_' + sceneIndex] &&
      this.refs['scene_' + sceneIndex].setNativeProps(SCENE_DISABLED_NATIVE_PROPS);
  },

  /**
   * Put the scene back into the state as defined by props.sceneStyle, so transitions can happen normally
   */
  _enableScene: function(sceneIndex) {
    // First, determine what the defined styles are for scenes in this navigator
    var sceneStyle = flattenStyle([styles.baseScene, this.props.sceneStyle]);
    // Then restore the left value for this scene
    var enabledSceneNativeProps = {
      left: sceneStyle.left,
    };
    if (sceneIndex !== this.state.transitionFromIndex &&
        sceneIndex !== this.state.presentedIndex) {
      // If we are not in a transition from this index, make sure opacity is 0
      // to prevent the enabled scene from flashing over the presented scene
      enabledSceneNativeProps.opacity = 0;
    }
    this.refs['scene_' + sceneIndex] &&
      this.refs['scene_' + sceneIndex].setNativeProps(enabledSceneNativeProps);
  },

  _onAnimationStart: function() {
    var fromIndex = this.state.presentedIndex;
    var toIndex = this.state.presentedIndex;
    if (this.state.transitionFromIndex != null) {
      fromIndex = this.state.transitionFromIndex;
    } else if (this.state.activeGesture) {
      toIndex = this.state.presentedIndex + this._deltaForGestureAction(this.state.activeGesture);
    }
    this._setRenderSceneToHarwareTextureAndroid(fromIndex, true);
    this._setRenderSceneToHarwareTextureAndroid(toIndex, true);
    var navBar = this._navBar;
    if (navBar && navBar.onAnimationStart) {
      navBar.onAnimationStart(fromIndex, toIndex);
    }
  },

  _onAnimationEnd: function() {
    var max = this.state.routeStack.length - 1;
    for (var index = 0; index <= max; index++) {
      this._setRenderSceneToHarwareTextureAndroid(index, false);
    }

    var navBar = this._navBar;
    if (navBar && navBar.onAnimationEnd) {
      navBar.onAnimationEnd();
    }
  },

  _setRenderSceneToHarwareTextureAndroid: function(sceneIndex, shouldRenderToHardwareTexture) {
    var viewAtIndex = this.refs['scene_' + sceneIndex];
    if (viewAtIndex === null || viewAtIndex === undefined) {
      return;
    }
    viewAtIndex.setNativeProps({renderToHardwareTextureAndroid: shouldRenderToHardwareTexture});
  },

  _handleTouchStart: function() {
    this._eligibleGestures = GESTURE_ACTIONS;
  },

  _handleMoveShouldSetPanResponder: function(e, gestureState) {
    var sceneConfig = this.state.sceneConfigStack[this.state.presentedIndex];
    this._expectingGestureGrant = this._matchGestureAction(this._eligibleGestures, sceneConfig.gestures, gestureState);
    return !! this._expectingGestureGrant;
  },

  _doesGestureOverswipe: function(gestureName) {
    var wouldOverswipeBack = this.state.presentedIndex <= 0 &&
      (gestureName === 'pop' || gestureName === 'jumpBack');
    var wouldOverswipeForward = this.state.presentedIndex >= this.state.routeStack.length - 1 &&
      gestureName === 'jumpForward';
    return wouldOverswipeForward || wouldOverswipeBack;
  },

  _handlePanResponderGrant: function(e, gestureState) {
    invariant(
      this._expectingGestureGrant,
      'Responder granted unexpectedly.'
    );
    this._attachGesture(this._expectingGestureGrant);
    this._onAnimationStart();
    this._expectingGestureGrant = null;
  },

  _deltaForGestureAction: function(gestureAction) {
    switch (gestureAction) {
      case 'pop':
      case 'jumpBack':
        return -1;
      case 'jumpForward':
        return 1;
      default:
        invariant(false, 'Unsupported gesture action ' + gestureAction);
        return;
    }
  },

  _handlePanResponderRelease: function(e, gestureState) {
    var sceneConfig = this.state.sceneConfigStack[this.state.presentedIndex];
    var releaseGestureAction = this.state.activeGesture;
    if (!releaseGestureAction) {
      // The gesture may have been detached while responder, so there is no action here
      return;
    }
    var releaseGesture = sceneConfig.gestures[releaseGestureAction];
    var destIndex = this.state.presentedIndex + this._deltaForGestureAction(this.state.activeGesture);
    if (this.spring.getCurrentValue() === 0) {
      // The spring is at zero, so the gesture is already complete
      this.spring.setCurrentValue(0).setAtRest();
      this._completeTransition();
      return;
    }
    var isTravelVertical = releaseGesture.direction === 'top-to-bottom' || releaseGesture.direction === 'bottom-to-top';
    var isTravelInverted = releaseGesture.direction === 'right-to-left' || releaseGesture.direction === 'bottom-to-top';
    var velocity, gestureDistance;
    if (isTravelVertical) {
      velocity = isTravelInverted ? -gestureState.vy : gestureState.vy;
      gestureDistance = isTravelInverted ? -gestureState.dy : gestureState.dy;
    } else {
      velocity = isTravelInverted ? -gestureState.vx : gestureState.vx;
      gestureDistance = isTravelInverted ? -gestureState.dx : gestureState.dx;
    }
    var transitionVelocity = clamp(-10, velocity, 10);
    if (Math.abs(velocity) < releaseGesture.notMoving) {
      // The gesture velocity is so slow, is "not moving"
      var hasGesturedEnoughToComplete = gestureDistance > releaseGesture.fullDistance * releaseGesture.stillCompletionRatio;
      transitionVelocity = hasGesturedEnoughToComplete ? releaseGesture.snapVelocity : -releaseGesture.snapVelocity;
    }
    if (transitionVelocity < 0 || this._doesGestureOverswipe(releaseGestureAction)) {
      // This gesture is to an overswiped region or does not have enough velocity to complete
      // If we are currently mid-transition, then this gesture was a pending gesture. Because this gesture takes no action, we can stop here
      if (this.state.transitionFromIndex == null) {
        // There is no current transition, so we need to transition back to the presented index
        var transitionBackToPresentedIndex = this.state.presentedIndex;
        // slight hack: change the presented index for a moment in order to transitionTo correctly
        this.state.presentedIndex = destIndex;
        this._transitionTo(
          transitionBackToPresentedIndex,
          - transitionVelocity,
          1 - this.spring.getCurrentValue()
        );
      }
    } else {
      // The gesture has enough velocity to complete, so we transition to the gesture's destination
      this._transitionTo(
        destIndex,
        transitionVelocity,
        null,
        () => {
          if (releaseGestureAction === 'pop') {
            this._cleanScenesPastIndex(destIndex);
          }
        }
      );
    }
    this._detachGesture();
  },

  _handlePanResponderTerminate: function(e, gestureState) {
    var destIndex = this.state.presentedIndex + this._deltaForGestureAction(this.state.activeGesture);
    this._detachGesture();
    var transitionBackToPresentedIndex = this.state.presentedIndex;
    // slight hack: change the presented index for a moment in order to transitionTo correctly
    this.state.presentedIndex = destIndex;
    this._transitionTo(
      transitionBackToPresentedIndex,
      null,
      1 - this.spring.getCurrentValue()
    );
  },

  _attachGesture: function(gestureId) {
    this.state.activeGesture = gestureId;
    var gesturingToIndex = this.state.presentedIndex + this._deltaForGestureAction(this.state.activeGesture);
    this._enableScene(gesturingToIndex);
  },

  _detachGesture: function() {
    this.state.activeGesture = null;
    this.state.pendingGestureProgress = null;
    this._hideScenes();
  },

  _handlePanResponderMove: function(e, gestureState) {
    var sceneConfig = this.state.sceneConfigStack[this.state.presentedIndex];
    if (this.state.activeGesture) {
      var gesture = sceneConfig.gestures[this.state.activeGesture];
      return this._moveAttachedGesture(gesture, gestureState);
    }
    var matchedGesture = this._matchGestureAction(GESTURE_ACTIONS, sceneConfig.gestures, gestureState);
    if (matchedGesture) {
      this._attachGesture(matchedGesture);
    }
  },

  _moveAttachedGesture: function(gesture, gestureState) {
    var isTravelVertical = gesture.direction === 'top-to-bottom' || gesture.direction === 'bottom-to-top';
    var isTravelInverted = gesture.direction === 'right-to-left' || gesture.direction === 'bottom-to-top';
    var distance = isTravelVertical ? gestureState.dy : gestureState.dx;
    distance = isTravelInverted ? - distance : distance;
    var gestureDetectMovement = gesture.gestureDetectMovement;
    var nextProgress = (distance - gestureDetectMovement) /
      (gesture.fullDistance - gestureDetectMovement);
    if (nextProgress < 0 && gesture.isDetachable) {
      var gesturingToIndex = this.state.presentedIndex + this._deltaForGestureAction(this.state.activeGesture);
      this._transitionBetween(this.state.presentedIndex, gesturingToIndex, 0);
      this._detachGesture();
      if (this.state.pendingGestureProgress != null) {
        this.spring.setCurrentValue(0);
      }
      return;
    }
    if (this._doesGestureOverswipe(this.state.activeGesture)) {
      var frictionConstant = gesture.overswipe.frictionConstant;
      var frictionByDistance = gesture.overswipe.frictionByDistance;
      var frictionRatio = 1 / ((frictionConstant) + (Math.abs(nextProgress) * frictionByDistance));
      nextProgress *= frictionRatio;
    }
    nextProgress = clamp(0, nextProgress, 1);
    if (this.state.transitionFromIndex != null) {
      this.state.pendingGestureProgress = nextProgress;
    } else if (this.state.pendingGestureProgress) {
      this.spring.setEndValue(nextProgress);
    } else {
      this.spring.setCurrentValue(nextProgress);
    }
  },

  _matchGestureAction: function(eligibleGestures, gestures, gestureState) {
    if (!gestures) {
      return null;
    }
    var matchedGesture = null;
    eligibleGestures.some((gestureName, gestureIndex) => {
      var gesture = gestures[gestureName];
      if (!gesture) {
        return;
      }
      if (gesture.overswipe == null && this._doesGestureOverswipe(gestureName)) {
        // cannot swipe past first or last scene without overswiping
        return false;
      }
      var isTravelVertical = gesture.direction === 'top-to-bottom' || gesture.direction === 'bottom-to-top';
      var isTravelInverted = gesture.direction === 'right-to-left' || gesture.direction === 'bottom-to-top';
      var currentLoc = isTravelVertical ? gestureState.moveY : gestureState.moveX;
      var travelDist = isTravelVertical ? gestureState.dy : gestureState.dx;
      var oppositeAxisTravelDist =
        isTravelVertical ? gestureState.dx : gestureState.dy;
      var edgeHitWidth = gesture.edgeHitWidth;
      if (isTravelInverted) {
        currentLoc = -currentLoc;
        travelDist = -travelDist;
        oppositeAxisTravelDist = -oppositeAxisTravelDist;
        edgeHitWidth = isTravelVertical ?
          -(SCREEN_HEIGHT - edgeHitWidth) :
          -(SCREEN_WIDTH - edgeHitWidth);
      }
      var moveStartedInRegion = gesture.edgeHitWidth == null ||
        currentLoc < edgeHitWidth;
      if (!moveStartedInRegion) {
        return false;
      }
      var moveTravelledFarEnough = travelDist >= gesture.gestureDetectMovement;
      if (!moveTravelledFarEnough) {
        return false;
      }
      var directionIsCorrect = Math.abs(travelDist) > Math.abs(oppositeAxisTravelDist) * gesture.directionRatio;
      if (directionIsCorrect) {
        matchedGesture = gestureName;
        return true;
      } else {
        this._eligibleGestures = this._eligibleGestures.slice().splice(gestureIndex, 1);
      }
    });
    return matchedGesture;
  },

  _transitionSceneStyle: function(fromIndex, toIndex, progress, index) {
    var viewAtIndex = this.refs['scene_' + index];
    if (viewAtIndex === null || viewAtIndex === undefined) {
      return;
    }
    // Use toIndex animation when we move forwards. Use fromIndex when we move back
    var sceneConfigIndex = fromIndex < toIndex ? toIndex : fromIndex;
    var sceneConfig = this.state.sceneConfigStack[sceneConfigIndex];
    // this happens for overswiping when there is no scene at toIndex
    if (!sceneConfig) {
      sceneConfig = this.state.sceneConfigStack[sceneConfigIndex - 1];
    }
    var styleToUse = {};
    var useFn = index < fromIndex || index < toIndex ?
      sceneConfig.animationInterpolators.out :
      sceneConfig.animationInterpolators.into;
    var directionAdjustedProgress = fromIndex < toIndex ? progress : 1 - progress;
    var didChange = useFn(styleToUse, directionAdjustedProgress);
    if (didChange) {
      viewAtIndex.setNativeProps({style: styleToUse});
    }
  },

  _transitionBetween: function(fromIndex, toIndex, progress) {
    this._transitionSceneStyle(fromIndex, toIndex, progress, fromIndex);
    this._transitionSceneStyle(fromIndex, toIndex, progress, toIndex);
    var navBar = this._navBar;
    if (navBar && navBar.updateProgress) {
      navBar.updateProgress(progress, fromIndex, toIndex);
    }
  },

  _handleResponderTerminationRequest: function() {
    return false;
  },

  _resetUpdatingRange: function() {
    this.state.updatingRangeStart = 0;
    this.state.updatingRangeLength = this.state.routeStack.length;
  },

  _getDestIndexWithinBounds: function(n) {
    var currentIndex = this.state.presentedIndex;
    var destIndex = currentIndex + n;
    invariant(
      destIndex >= 0,
      'Cannot jump before the first route.'
    );
    var maxIndex = this.state.routeStack.length - 1;
    invariant(
      maxIndex >= destIndex,
      'Cannot jump past the last route.'
    );
    return destIndex;
  },

  _jumpN: function(n) {
    var destIndex = this._getDestIndexWithinBounds(n);
    var requestTransitionAndResetUpdatingRange = () => {
      this._enableScene(destIndex);
      this._transitionTo(destIndex);
      this._resetUpdatingRange();
    };
    this.setState({
      updatingRangeStart: destIndex,
      updatingRangeLength: 1,
    }, requestTransitionAndResetUpdatingRange);
  },

  jumpTo: function(route) {
    var destIndex = this.state.routeStack.indexOf(route);
    invariant(
      destIndex !== -1,
      'Cannot jump to route that is not in the route stack'
    );
    this._jumpN(destIndex - this.state.presentedIndex);
  },

  jumpForward: function() {
    this._jumpN(1);
  },

  jumpBack: function() {
    this._jumpN(-1);
  },

  push: function(route) {
    invariant(!!route, 'Must supply route to push');
    var activeLength = this.state.presentedIndex + 1;
    var activeStack = this.state.routeStack.slice(0, activeLength);
    var activeIDStack = this.state.idStack.slice(0, activeLength);
    var activeAnimationConfigStack = this.state.sceneConfigStack.slice(0, activeLength);
    var nextStack = activeStack.concat([route]);
    var destIndex = nextStack.length - 1;
    var nextIDStack = activeIDStack.concat([getuid()]);
    var nextAnimationConfigStack = activeAnimationConfigStack.concat([
      this.props.configureScene(route),
    ]);
    var requestTransitionAndResetUpdatingRange = () => {
      this._enableScene(destIndex);
      this._transitionTo(destIndex);
      this._resetUpdatingRange();
    };
    this.setState({
      idStack: nextIDStack,
      routeStack: nextStack,
      sceneConfigStack: nextAnimationConfigStack,
      updatingRangeStart: nextStack.length - 1,
      updatingRangeLength: 1,
    }, requestTransitionAndResetUpdatingRange);
  },

  _popN: function(n) {
    if (n === 0) {
      return;
    }
    invariant(
      this.state.presentedIndex - n >= 0,
      'Cannot pop below zero'
    );
    var popIndex = this.state.presentedIndex - n;
    this._enableScene(popIndex);
    this._transitionTo(
      popIndex,
      null, // default velocity
      null, // no spring jumping
      () => {
        this._cleanScenesPastIndex(popIndex);
      }
    );
  },

  pop: function() {
    this._popN(1);
  },

  /**
   * Replace a route in the navigation stack.
   *
   * `index` specifies the route in the stack that should be replaced.
   * If it's negative, it counts from the back.
   */
  replaceAtIndex: function(route, index, cb) {
    invariant(!!route, 'Must supply route to replace');
    if (index < 0) {
      index += this.state.routeStack.length;
    }

    if (this.state.routeStack.length <= index) {
      return;
    }

    // I don't believe we need to lock for a replace since there's no
    // navigation actually happening
    var nextIDStack = this.state.idStack.slice();
    var nextRouteStack = this.state.routeStack.slice();
    var nextAnimationModeStack = this.state.sceneConfigStack.slice();
    nextIDStack[index] = getuid();
    nextRouteStack[index] = route;
    nextAnimationModeStack[index] = this.props.configureScene(route);

    this.setState({
      idStack: nextIDStack,
      routeStack: nextRouteStack,
      sceneConfigStack: nextAnimationModeStack,
      updatingRangeStart: index,
      updatingRangeLength: 1,
    }, () => {
      this._resetUpdatingRange();
      if (index === this.state.presentedIndex) {
        this._emitWillFocus(route);
        this._emitDidFocus(route);
      }
      cb && cb();
    });
  },

  /**
   * Replaces the current scene in the stack.
   */
  replace: function(route) {
    this.replaceAtIndex(route, this.state.presentedIndex);
  },

  /**
   * Replace the current route's parent.
   */
  replacePrevious: function(route) {
    this.replaceAtIndex(route, this.state.presentedIndex - 1);
  },

  popToTop: function() {
    this.popToRoute(this.state.routeStack[0]);
  },

  popToRoute: function(route) {
    var indexOfRoute = this.state.routeStack.indexOf(route);
    invariant(
      indexOfRoute !== -1,
      'Calling popToRoute for a route that doesn\'t exist!'
    );
    var numToPop = this.state.presentedIndex - indexOfRoute;
    this._popN(numToPop);
  },

  replacePreviousAndPop: function(route) {
    if (this.state.routeStack.length < 2) {
      return;
    }
    this.replacePrevious(route);
    this.pop();
  },

  resetTo: function(route) {
    invariant(!!route, 'Must supply route to push');
    this.replaceAtIndex(route, 0, () => {
      // Do not use popToRoute here, because race conditions could prevent the
      // route from existing at this time. Instead, just go to index 0
      if (this.state.presentedIndex > 0) {
        this._popN(this.state.presentedIndex);
      }
    });
  },

  getCurrentRoutes: function() {
    return this.state.routeStack;
  },

  _handleItemRef: function(itemId, route, ref) {
    this._itemRefs[itemId] = ref;
    var itemIndex = this.state.idStack.indexOf(itemId);
    if (itemIndex === -1) {
      return;
    }
    this.props.onItemRef && this.props.onItemRef(ref, itemIndex, route);
  },

  _cleanScenesPastIndex: function(index) {
    var newStackLength = index + 1;
    // Remove any unneeded rendered routes.
    if (newStackLength < this.state.routeStack.length) {
      var updatingRangeStart = newStackLength; // One past the top
      var updatingRangeLength = this.state.routeStack.length - newStackLength + 1;
      this.state.idStack.slice(newStackLength).map((removingId) => {
        this._itemRefs[removingId] = null;
      });
      this.setState({
        updatingRangeStart: updatingRangeStart,
        updatingRangeLength: updatingRangeLength,
        sceneConfigStack: this.state.sceneConfigStack.slice(0, newStackLength),
        idStack: this.state.idStack.slice(0, newStackLength),
        routeStack: this.state.routeStack.slice(0, newStackLength),
      }, this._resetUpdatingRange);
    }
  },

  _renderOptimizedScenes: function() {
    // To avoid rendering scenes that are not visible, we use
    // updatingRangeStart and updatingRangeLength to track the scenes that need
    // to be updated.

    // To avoid visual glitches, we never re-render scenes during a transition.
    // We assume that `state.updatingRangeLength` will have a length during the
    // initial render of any scene
    var shouldRenderScenes = this.state.updatingRangeLength !== 0;
    if (shouldRenderScenes) {
      return (
        <StaticContainer shouldUpdate={true}>
          <View
            style={styles.transitioner}
            {...this.panGesture.panHandlers}
            onTouchStart={this._handleTouchStart}
            onResponderTerminationRequest={
              this._handleResponderTerminationRequest
            }>
            {this.state.routeStack.map(this._renderOptimizedScene)}
          </View>
        </StaticContainer>
      );
    }
    // If no scenes are changing, we can save render time. React will notice
    // that we are rendering a StaticContainer in the same place, so the
    // existing element will be updated. When React asks the element
    // shouldComponentUpdate, the StaticContainer will return false, and the
    // children from the previous reconciliation will remain.
    return (
      <StaticContainer shouldUpdate={false} />
    );
  },

  _renderOptimizedScene: function(route, i) {
    var shouldRenderScene =
      i >= this.state.updatingRangeStart &&
      i <= this.state.updatingRangeStart + this.state.updatingRangeLength;
    var sceneNavigatorContext = {
      ...this.navigatorContext,
      route,
      setHandler: (handler) => {
        this.navigatorContext.setHandlerForIndex(i, handler);
      },
      onWillFocus: (childRoute) => {
        this._subRouteFocus[i] = childRoute;
        if (this.state.presentedIndex === i) {
          this._emitWillFocus(childRoute);
        }
      },
      onDidFocus: (childRoute) => {
        this._subRouteFocus[i] = childRoute;
        if (this.state.presentedIndex === i) {
          this._emitDidFocus(childRoute);
        }
      },
    };
    var scene = shouldRenderScene ?
      this._renderScene(route, i, sceneNavigatorContext) : null;
    return (
      <NavigatorStaticContextContainer
        navigatorContext={sceneNavigatorContext}
        key={'nav' + i}
        shouldUpdate={shouldRenderScene}>
        {scene}
      </NavigatorStaticContextContainer>
    );
  },

  _renderScene: function(route, i, sceneNavigatorContext) {
    var child = this.props.renderScene(
      route,
      sceneNavigatorContext
    );
    var disabledSceneStyle = null;
    if (i !== this.state.presentedIndex) {
      disabledSceneStyle = styles.disabledScene;
    }
    var originalRef = child.ref;
    if (originalRef != null && typeof originalRef !== 'function') {
      console.warn(
        'String refs are not supported for navigator scenes. Use a callback ' +
        'ref instead. Ignoring ref: ' + originalRef
      );
      originalRef = null;
    }
    return (
      <View
        key={this.state.idStack[i]}
        ref={'scene_' + i}
        onStartShouldSetResponderCapture={() => {
          return !!this.state.transitionFromIndex || !!this.state.activeGesture;
        }}
        style={[styles.baseScene, this.props.sceneStyle, disabledSceneStyle]}>
        {React.cloneElement(child, {
          ref: component => {
            this._handleItemRef(this.state.idStack[i], route, component);
            if (originalRef) {
              originalRef(component);
            }
          }
        })}
      </View>
    );
  },

  _renderNavigationBar: function() {
    if (!this.props.navigationBar) {
      return null;
    }
    return React.cloneElement(this.props.navigationBar, {
      ref: (navBar) => { this._navBar = navBar; },
      navigator: this.navigatorContext,
      navState: this.state,
    });
  },

  render: function() {
    return (
      <View style={[styles.container, this.props.style]}>
        {this._renderOptimizedScenes()}
        {this._renderNavigationBar()}
      </View>
    );
  },
});

module.exports = Navigator;
