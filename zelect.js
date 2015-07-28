/*
  zelect-0.0.9

  opts:
    throttle:       ms: delay to throttle filtering of results when search term updated, 0 means synchronous
    loader:         function(term, page, callback): load more items
                      callback expects an array of items
    renderItem:     function(item, term): render the content of a single item
    initial:        "item": arbitrary item to set the initial selection to
                      placeholder is not required if initial item is provided
    placeholder:    String/DOM/jQuery: placeholder text/html before anything is selected
                      zelect automatically selects first item if not provided
    noResults:      function(term?): function to create no results text
    regexpMatcher:  function(term): override regexp creation when filtering options
    selectOnMouseEnter: set selection when hovering on an item
*/
(function($) {
  var keys = { tab:9, enter:13, esc:27, left:37, up:38, right:39, down:40 }
  var defaults = {
    throttle: 300,
    renderItem: defaultRenderItem,
    noResults: defaultNoResults,
    regexpMatcher: defaultRegexpMatcher,
    selectOnMouseEnter: true,
    renderSearch: function () { return $('<input>').addClass('zearch') },
    renderResultContainer: function () { return $('<ol>')},
    queryExtractor: function ($search) {return function () { return $search.val() }},
    itemPrefix: 'li.zelect-item',
    loadOptionsOnlyWhenNeeded: false
  }

  $.fn.zelect = function(opts) {
    opts = $.extend({}, defaults, opts)

    return this.each(function() {
      if ($(this).parent().length === 0) throw new Error('<select> element must have a parent')
      var $select = $(this).hide().data('zelectItem', selectItem).data('refreshItem', refreshItem).data('reset', reset).data('refreshZelect', refreshZelect)

      var $zelect = $('<div>').addClass('zelect')
      var $selected = opts.renderResultContainer().addClass('zelected')
      var $dropdown = $('<div>').addClass('dropdown').hide()
      var $noResults = $('<div>').addClass('no-results')
      var $search = opts.renderSearch()
      var $list = opts.renderResultContainer()
      var itemPrefix = opts.itemPrefix
      var queryExtractor = opts.queryExtractor($search)
      var listNavigator = navigable($list, opts.selectOnMouseEnter, $select, itemPrefix)

      var itemHandler = opts.loader
        ? infiniteScroll($list, opts.loader, appendItem, itemPrefix)
        : selectBased($select, $list, opts.regexpMatcher, appendItem)

      var filter = throttled(opts.throttle, function() {
        var term = searchTerm()
        itemHandler.load(term, function() { checkResults(term) })
      })

      $search.keyup(function(e) {
        switch (e.which) {
          case keys.esc: hide(); return;
          case keys.up: return;
          case keys.down: return;
          case keys.enter:
            var curr = listNavigator.current().data('zelect-item')
            console.log('current iz', curr)
            if (curr) selectItem(curr)
            return
          default: filter()
        }
      })
      $search.on('zelect-filter', filter)
      $search.keydown(function(e) {
        switch (e.which) {
          case keys.up: e.preventDefault(); listNavigator.prev(); return;
          case keys.down: e.preventDefault(); listNavigator.next(); return;
        }
      })

      $list.on('click', itemPrefix + ':not(.disabled)', function() { selectItem($(this).data('zelect-item')) })
      $zelect.mouseenter(function() { $zelect.addClass('hover') })
      $zelect.mouseleave(function() { $zelect.removeClass('hover') })
      $zelect.attr("tabindex", $select.attr("tabindex"))
      $zelect.blur(function() { if (!$zelect.hasClass('hover')) hide() })
      $search.blur(function() { if (!$zelect.hasClass('hover')) hide() })

      $selected.click(toggle)

      $('body').on('click.closeZelect', function(evt) {
        var clickWasOutsideZelect = $(evt.target).closest($zelect).length === 0
        if (clickWasOutsideZelect) hide()
      })

      $zelect.insertAfter($select)
        .append($selected)
        .append($dropdown.append($('<div>').addClass('zearch-container').append($search).append($noResults)).append($list))

      if (opts.loadOptionsOnlyWhenNeeded) {
        initialSelection(true)
        $noResults.hide()
        $select.trigger('ready')
      } else {
        loadInitialOptions()
      }

      function loadInitialOptions() {
        itemHandler.load(queryExtractor(), function() {
          initialSelection(true)
          $select.trigger('ready')
        })
      }

      function selectItem(item, triggerChange) {
        renderContent($selected, opts.renderItem(item)).removeClass('placeholder')
        hide()
        if (item && item.value !== undefined) $select.val(item.value)
        $select.data('zelected', item)
        if (triggerChange == null || triggerChange === true) $select.trigger('change', item)
      }

      function refreshItem(item, identityCheckFn) {
        var eq = function(a, b) { return identityCheckFn(a) === identityCheckFn(b) }
        if (eq($select.data('zelected'), item)) {
          renderContent($selected, opts.renderItem(item))
          $select.data('zelected', item)
        }
        var term = searchTerm()
        $list.find(itemPrefix).each(function() {
          if (eq($(this).data('zelect-item'), item)) {
            renderContent($(this), opts.renderItem(item, term)).data('zelect-item', item)
          }
        })
      }

      function reset() {
        $search.val('')
        itemHandler.load('', function() {
          initialSelection(false)
        })
      }
      function refreshZelect(callback) {
        itemHandler.load(queryExtractor($search), function() {
          callback && callback()
        })
      }

      function toggle() {
        $dropdown.toggle()
        $zelect.toggleClass('open')
        if ($dropdown.is(':visible')) {
          $search.data().focus ? $search.data().focus() : $search.focus().select()
          itemHandler.check()
          listNavigator.ensure()
        }
      }

      function hide() {
        $dropdown.hide()
        $zelect.removeClass('open')
      }

      function renderContent($obj, content) {
        if(textContent(content)) {
          $obj.text(content)
        } else {
          $obj.empty()
          $obj.append(content)
        }
        return $obj
        function textContent(x) {
          var b = (!(x instanceof jQuery));
          var b2 = x.nodeType == null;
          var b3 = !$.isArray(content);
          return b && b2 && b3 }
      }

      function appendItem(item, term) {
        var tagName = itemPrefix,
          classes
        var dotIndex = itemPrefix.indexOf('.')
        if (dotIndex !== -1) {
          if (itemPrefix[0] === '.') {
            tagName = 'li'
            classes = itemPrefix.substring(1).replace(/\./g, ' ')
          } else {
            tagName = itemPrefix.substring(0, dotIndex)
            classes = itemPrefix.substring(dotIndex + 1).replace(/\./g, ' ')
          }
        }
        $list.append(renderContent($('<' + tagName + '>').data('zelect-item', item).toggleClass('disabled', !!item.disabled).addClass(classes), opts.renderItem(item, term)))
      }

      function checkResults(term) {
        if ($list.children().size() === 0) {
          $noResults.html(opts.noResults(term)).show()
        } else {
          $noResults.hide()
          listNavigator.ensure()
        }
      }
      function searchTerm() { return queryExtractor() }

      function initialSelection(useOptsInitial) {
        var $s = $select.find('option[selected]')
        if (useOptsInitial && opts.initial) {
          selectItem(opts.initial)
        } else if (!opts.loader && $s.size() > 0) {
          selectItem($list.children().eq($s.index()).data('zelect-item'))
        } else if (opts.placeholder) {
          $selected.html(opts.placeholder).addClass('placeholder')
        } else {
          var first = $list.find(itemPrefix + ':first').data('zelect-item')
          first !== undefined && first !== null ? selectItem(first) : $selected.html(opts.noResults()).addClass('placeholder')
        }
        checkResults()
      }
    })
  }

  function selectBased($select, $list, regexpMatcher, appendItemFn) {
    var dummyRegexp = { test: function() { return true } }
    var options = $select.find('option').map(function() { return itemFromOption($(this)) }).get()

    function filter(term) {
      var regexp = (term === '') ? dummyRegexp : regexpMatcher(term)
      $list.empty()
      $.each(options, function(ii, item) {
        if (regexp.test(item.label)) appendItemFn(item, term)
      })
    }
    function itemFromOption($option) {
      return { value: $option.val(), label: $option.text(), disabled: $option.prop('disabled') }
    }
    function newTerm(term, callback) {
      filter(term)
      if (callback) callback()
    }
    return { load:newTerm, check:function() {} }
  }

  function infiniteScroll($list, loadFn, appendItemFn, itemPrefix) {
    var state = { id:0, term:'', page:0, loading:false, exhausted:false, callback:undefined }

    $list.scroll(maybeLoadMore)

    function load() {
      if (state.loading || state.exhausted) return
      state.loading = true
      $list.addClass('loading')
      var stateId = state.id
      loadFn(state.term, state.page, function(items) {
        if (stateId !== state.id) return
        if (state.page == 0) $list.empty()
        state.page++
        if (!items || items.length === 0) state.exhausted = true
        $.each(items, function(ii, item) { appendItemFn(item, state.term) })
        state.loading = false
        if (!maybeLoadMore()) {
          if (state.callback) state.callback()
          state.callback = undefined
          $list.removeClass('loading')
        }
      })
    }

    function maybeLoadMore() {
      if (state.exhausted) return false
      var $lastChild =  $list.find(itemPrefix + ':last')
      if ($lastChild.size() === 0) {
        load()
        return true
      } else {
        var lastChildTop = $lastChild.offset().top - $list.offset().top
        var lastChildVisible = lastChildTop < $list.outerHeight()
        if (lastChildVisible) load()
        return lastChildVisible
      }
    }

    function newTerm(term, callback) {
      state = { id:state.id+1, term:term, page:0, loading:false, exhausted:false, callback:callback }
      load()
    }
    return { load:newTerm, check:maybeLoadMore }
  }

  $.fn.zelectItem = callInstance('zelectItem')
  $.fn.refreshZelectItem = callInstance('refreshItem')
  $.fn.resetZelect = callInstance('reset')
  $.fn.refreshZelect = callInstance('refreshZelect')

  function callInstance(fnName) {
    return function() {
      var args = [].slice.call(arguments)
      return this.each(function() {
        var fn = $(this).data(fnName)
        fn && fn.apply(undefined, args)
      })
    }
  }

  function throttled(ms, callback) {
    if (ms <= 0) return callback
    var timeout = undefined
    return function() {
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(callback, ms)
    }
  }

  function defaultRenderItem(item, term) {
    if (item == undefined || item == null) {
      return ''
    } else if ($.type(item) === 'string') {
      return item
    } else if (item.label) {
      return item.label
    } else if (item.toString) {
      return item.toString()
    } else {
      return item
    }
  }

  function defaultNoResults(term) {
    return "No results for '"+(term || '')+"'"
  }

  function defaultRegexpMatcher(term) {
    return new RegExp('(^|\\s)'+term, 'i')
  }

  function navigable($list, selectOnMouseEnter, $select, itemPrefix) {
    var skipMouseEvent = false
    if(selectOnMouseEnter) {
      $list.on('mouseenter', itemPrefix + ':not(.disabled)', onMouseEnter)
    } else {
      $list.on('click', itemPrefix + ':not(.disabled)', onMouseClick)
    }

    function next() {
      var $next = current().next(itemPrefix + ':not(.disabled)')
      if (set($next)) ensureBottomVisible($next)
    }
    function prev() {
      var $prev = current().prev(itemPrefix + ':not(.disabled)')
      if (set($prev)) ensureTopVisible($prev)
    }
    function current() {
      return $list.find('.current')
    }
    function ensure() {
      if (current().size() === 0) {
        var selected = $select.data('zelected')
        if (selected) {
          $list.find(itemPrefix + ':not(.disabled):contains('+selected.value+')').addClass('current')
        } else {
          $list.find(itemPrefix + ':not(.disabled)').eq(0).addClass('current')
        }
      }
    }
    function set($item) {
      if ($item.size() === 0) return false
      current().removeClass('current')
      $item.addClass('current')
      return true
    }
    function onMouseEnter() {
      if (skipMouseEvent) {
        skipMouseEvent = false
        return
      }
      set($(this))
    }
    function onMouseClick() {
      set($(this))
    }

    function itemTop($item) {
      return $item.offset().top - $list.offset().top
    }
    function ensureTopVisible($item) {
      var scrollTop = $list.scrollTop()
      var offset = itemTop($item) + scrollTop
      if (scrollTop > offset) {
        moveScroll(offset)
      }
    }
    function ensureBottomVisible($item) {
      var scrollBottom = $list.height()
      var itemBottom = itemTop($item) + $item.outerHeight()
      if (scrollBottom < itemBottom) {
        moveScroll($list.scrollTop() + itemBottom - scrollBottom)
      }
    }
    function moveScroll(offset) {
      $list.scrollTop(offset)
      skipMouseEvent = true
    }
    return { next:next, prev:prev, current:current, ensure:ensure }
  }
})(jQuery)
