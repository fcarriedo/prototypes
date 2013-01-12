
// Event bus
eventBus = {};
_.extend(eventBus, Backbone.Events);

// Models
Product = Backbone.Model.extend({});
Page = Backbone.Model.extend({
  defaults: function() { return{active: false} },
  initialize: function(){
    this.products = this.nestCollection(this, 'products', new ProductList(this.get('products')));
  },
  sync: function() {
    // Prevent default sync w/ backend on destroy and else.
    return false;
  }
});
Bullet = Backbone.Model.extend({});
Layout = Backbone.Model.extend({
  defaults: function() { return{ id: 'default', prodsPerPage: 4, active: false} }
});

// Collections
ProductList = Backbone.Collection.extend({model: Product});
PageList = Backbone.Collection.extend({model: Page});
LayoutList = Backbone.Collection.extend({model: Layout});

// Views
PageView = Backbone.View.extend({
  className: 'page',
  hovered: false,
  hoverDelay: 350,
  // Holds the previous hover state for prodOverPage state machine
  previousPage: {id: 0},
  events: {
    'click' : 'setActive'
  },
  initialize: function() {

    // Getting the layout
    var layout = this.model.get('layout');
    var layoutTmpl = $('#' + layout.id).clone();
    // Setting the layout
    this.$el.html(layoutTmpl.html());
    this.$prodContainer = this.$('.prod-container-' + layout.id);

    // Model events
    this.model.on('change:active', this.onActiveChange, this);
    this.model.on('productsLayoutChanged', this.updateProducts, this);
    // TODO: Check if we can minimize renders later
    // Page products events
    this.model.products.on('add remove reset', this.render, this);
    this.model.products.on('destroy', this.onProdDestroy, this);

    this.$el.attr('id', 'page-' + this.model.id);
    this.$el.data('model', this.model);
    var self = this;
    this.$el.sortable({
      connectWith: '.page',
      items: '.product',
      tolerance: 'pointer',
      revert: true,
      start: function(evt, ui) {
        // On start dragging, initialize the state to the current page
        _.extend(self.previousPage, {id: self.model.id});
      },
      over: function(evt, ui) {
        self.hovered = true;
        setTimeout(function() {
          if(self.hovered) {

            // Trigger product-hover-page transition event on state change
            var currentPg = self.model;
            if(self.previousPage.id !== currentPg.id) {
              // Trigger the product hover change and send the relevant jQuery objects.
              var $startPg = self.$el.siblings('#page-' + self.previousPage.id);
              var $endPg = self.$el;
              eventBus.trigger('prodHoverPageTransition', $startPg, $endPg);

              // Set the current page as active
              self.setActive();

              // Overwrite previous hover state to current page
              _.extend(self.previousPage, {id: currentPg.id});
            }
          }
        }, self.hoverDelay);
      },
      out: function(evt, ui) {
        self.hovered = false;
      },
      update: function(evt, ui) {
        // Just send one event for the active page
        if(self.model.get('active')) {
          var prod = ui.item.data('model');
          var pg = self.model;
          self.model.trigger('productDropped', prod, pg);
        }
      }
    });
  },
  render: function() {
    if(this.model.products.isEmpty()) {
      // If there are no products to hold, we delete it.
      this.model.destroy();
      var self = this;
      this.$el.fadeOut('fast', function() {
        self.remove();
      });
    } else {
      this.$prodContainer.html('');
      this.model.products.each(this.addProduct, this);
    }

    return this;
  },
  addProduct: function(prod) {
    this.$prodContainer.append(new ProductView({model: prod}).render().el);
  },
  setActive: function() {
    this.model.set('active', true);
  },
  onActiveChange: function() {
    if(this.model.get('active')) {
      this.$el.addClass('active');
      // Perform the actual slide
      $('#page-viewport').scrollTo('#'+this.$el.attr('id'), 250, {over: -0.12});
    } else {
      this.$el.removeClass('active');
    }
  },
  updateProducts: function() {
    // We check the prods that exist on the current page and update it (reset).
    var prodsTmp = [];
    this.$el.find('.product').each(function(ix) {
      prodsTmp.push( $(this).data('model') );
    });
    this.model.products.reset(prodsTmp);
  },
  onProdDestroy: function(prod) {
    this.model.trigger('productDeleted', this.model, prod);
  }
});
// TODO: Rewrite the rendering
PageListView = Backbone.View.extend({
  el: $('#page-viewport'),
  initialize: function() {
    this.$bulletContainer = $('#bullet-container');
    this.showHideBullets();

    // Clean them up
    this.$el.html('');
    this.$bulletContainer.html('');

    // TODO: Fix this rendering/creating to prevent multiple event registering
    eventBus.off('toolbarSpaceClicked').on('toolbarSpaceClicked', this.addEmptyProd, this);
    eventBus.off('prodHoverPageTransition').on('prodHoverPageTransition', this.onProdHoverPageTransition, this);

    // Listeners
    this.collection.on('add', this.addPage, this);
    // Listening to page active change
    this.collection.on('change:active', this.onPageActivated, this);
    // When destroying a page, set the last existing page as active.
    this.collection.on('destroy', this.onPageDestroyed, this);
    // When a product gets dropped after dragging.
    this.collection.on('productDropped', this.onProductDropped, this);
    // When an empty product gets deleted
    this.collection.on('productDeleted', this.onProductDeleted, this);
  },
  render: function() {
    // Clean them up
    this.$el.html('');
    this.$bulletContainer.html('');

    // Add all pages to the view
    this.collection.each(this.addPage, this);

    // Set the first page as active if none active pages exist
    if(this.collection.every(function(page) { return page.get('active') === false})) {
      this.collection.get(0).set('active', true);
    }

    return this;
  },
  addPage: function(page) {
    this.$el.append(new PageView({model: page}).render().$el.fadeIn('fast'));
    this.$bulletContainer.append(new BulletView({model: page}).render().$el.fadeIn('fast'));
    this.showHideBullets();
  },
  addEmptyProd: function() {
    var lastPage = this.collection.at(this.collection.length-1);
    var layout = lastPage.get('layout');
    if(lastPage.products.length < layout.get('prodsPerPage')) {
      lastPage.products.add(new Product({}));
    } else {
      // We need to create a new page and add it there.
      var newPgId = parseInt(lastPage.id) + 1;
      var newPage = new Page({id: newPgId, layout: layout});
      // Add an empty product
      newPage.products.add(new Product({}));
      // Add it to the collection
      this.collection.add(newPage);
    }

    // Set the adding product page as active
    this.collection.at(this.collection.length-1).set('active', true);
  },
  onPageActivated: function(updatingPage) {
    if(updatingPage.get('active')) {
      this.collection.each(function(page) {
        if(page.id != updatingPage.id) page.set('active', false);
      });
    }
  },
  showHideBullets: function() {
    this.$bulletContainer.toggle(this.collection.length > 1);
  },
  onPageDestroyed: function(deletingPage) {
    if(deletingPage.get('active')) {
      this.collection.at(this.collection.length-1).set('active', true);
      this.showHideBullets();
    }
  },
  onProdHoverPageTransition: function($startPg, $endPg) {
    var startPg = $startPg.data('model');
    var endPg = $endPg.data('model');

    var shift = startPg.id < endPg.id ? 'up' : 'down';
    //console.log('Shift ' + shift + ' from pg ' + startPg.id + ' to pg ' + endPg.id);

    if(shift === 'up') {
      // We need to shift up the first element of every in-range page
      for(var i=parseInt(startPg.id); i<endPg.id; i++) {
        //console.log('Getting the first prod from pg ' + (i+1) + ' and appending it to pg ' + i);
        var $srcPg = this.$('#page-' + (i+1));
        var $dstPg = this.$('#page-' + i);

        var $firstProd = this.getVisibleProducts($srcPg).first();
        $dstPg.find('[class^="prod-container-"]').append($firstProd);
      }
    } else if(shift === 'down') {
      // We need to shift down the last element of every in-range page
      for(var i=parseInt(startPg.id); i>endPg.id; i--) {
        //console.log('Getting the last prod from pg ' + (i-1) + ' and prepending it to pg ' + i);
        var $srcPg = this.$('#page-' + (i-1));
        var $dstPg = this.$('#page-' + i);

        var $lastProd = this.getVisibleProducts($srcPg).last();
        $dstPg.find('[class^="prod-container-"]').prepend($lastProd);
      }
    }
  },
  getVisibleProducts: function($pg) {
    return $pg.find('.product').filter(function() { return $(this).css('visibility') !== 'hidden' });
  },
  onProductDropped: function(prod, page) {
    //console.log('Prod "' + prod.id + '" dropped on page ' + page.id);
    this.notifyProductsLayoutChanged();
  },
  onProductDeleted: function(pg) {
    for(var i=parseInt(pg.id); i<this.collection.length-1; i++) {
      var $srcPg = this.$('#page-' + (i+1));
      var $dstPg = this.$('#page-' + i);

      var $fistProd = this.getVisibleProducts($srcPg).first();
      $dstPg.find('[class^="prod-container-"]').append($fistProd);
    }

    this.notifyProductsLayoutChanged();
  },
  // Notify that the products layout of each page have changed
  notifyProductsLayoutChanged: function() {
    this.collection.each(function(pg) {pg.trigger('productsLayoutChanged')});
  }
});
ProductView = Backbone.View.extend({
  className: 'product',
  events: {
    'mouseenter'    : 'showActions',
    'mouseleave'    : 'hideActions',
    'click .delete' : 'deleteEmptyProd'
  },
  initialize: function() {
    if(this.model.id) {
      this.$el.attr('id', 'sku-' + this.model.get('sku'));
    } else {
      this.$el.attr('id', 'sku-empty-' + this.model.cid);
      this.$el.addClass('empty');
    }
    this.$el.data('model', this.model);
  },
  render: function() {
    if(this.model.id) {
      this.$el.html('<span class="product-info">sku: ' + this.model.get('sku') + '</span>');
    } else {
      this.$el.html('<span class="product-info">empty</span><span class="delete hide" title="delete">x</span>');
    }
    return this;
  },
  deleteEmptyProd: function() {
    this.model.destroy();
  },
  showActions: function() {
    this.$('.delete').show();
  },
  hideActions: function() {
    this.$('.delete').hide();
  }
});
BulletView = Backbone.View.extend({
  className: 'bullet',
  hovered: false,
  hoverDelay: 700,
  events: {
    'click' : 'setPageActive'
  },
  initialize: function() {
    this.page = this.model;
    this.page.on('change:active', this.onActiveChange, this);
    this.page.on('destroy', this.remove, this);
  },
  render: function() {
    this.$el.attr('title', 'Page ' + (parseInt(this.page.get('id'))+1));
    var self = this;
    this.$el.droppable({
      accept: '.product',
      tolerance: 'pointer',
      over: function(evt, ui) {
        self.dragHoverOn();
      },
      out: function(evt, ui) {
        self.dragHoverOff();
      },
      drop: function(evt, ui) {
        self.$el.removeClass('active sliding');
      }
    });
    return this;
  },
  dragHoverOn: function() {
    this.$el.addClass('active');
    var self = this;
    this.hovered = true;
    setTimeout(function() {
      if(self.hovered) {
        self.$el.addClass('sliding');
        self.setPageActive();
      }
    }, this.hoverDelay);
  },
  dragHoverOff: function() {
    this.$el.removeClass('active sliding');
    this.hovered = false;
  },
  setPageActive: function(evt) {
    this.page.set('active', true);
  },
  onActiveChange: function() {
    if(this.page.get('active')) {
      this.$el.addClass('selected');
    } else {
      this.$el.removeClass('selected');
    }
  }
});
LayoutDisplayView = Backbone.View.extend({
  el: $('#app'),
  events: {
    'click #toolbar-space' : 'triggerAddEmptyProd'
  },
  initialize: function(opts) {
    this.layouts = opts.layouts;

    this.layouts.on('change:active', this.updateLayout, this);

    this.layout = opts.layout ? opts.layout : new Layout();
  },
  render: function() {
    var prodsPerPage = this.layout.get('prodsPerPage');
    var totalPages = Math.ceil(this.collection.length/prodsPerPage);

    var pageList = new PageList();
    var prodsArray = this.collection.toArray();
    for(pgIx in _.range(totalPages)) {
      var initProdIx = pgIx*prodsPerPage;
      var prods = prodsArray.slice(initProdIx, initProdIx+prodsPerPage);

      // Create the productList for the page
      var prodsList = new ProductList().reset(prods);

      // Create all the pages and add them to the page list
      var page = new Page({id: pgIx, layout: this.layout});
      page.products = prodsList;
      pageList.add(page);
    }
    new PageListView({collection: pageList}).render();
  },
  updateLayout: function(newLayout) {
    if(newLayout.get('active')) {
      this.layout = newLayout;
      this.render();
    }
  },
  triggerAddEmptyProd: function() {
    eventBus.trigger('toolbarSpaceClicked');
  }
});
LayoutToolbar = Backbone.View.extend({
  el: $('#layout-popover'),
  initialize: function() {
    this.collection.on('change:active', this.updateActiveLayout, this);

    var html = $('<div></div>');
    this.collection.each(function(layout) {
      html.append(new LayoutView({model: layout}).render().el);
    }, this);

    this.$el.popover({
      title: 'Select your layout...',
      html: true,
      placement: 'top',
      content: html
    });
  },
  render: function() {
    return this;
  },
  updateActiveLayout: function(updatingLayout) {
    if(updatingLayout.get('active')) {
      this.collection.each(function(layout) {
        if(layout.id !== updatingLayout.id) layout.set('active', false);
      });
    }
  }
});
LayoutView = Backbone.View.extend({
  className: 'layout-icon',
  events: {
    'click' : 'setActiveLayout'
  },
  initialize: function() {
    this.$el.attr('title', this.model.id);
    this.model.on('change:active', this.updateActiveUI, this);
  },
  render: function() {
    this.$el.text(this.model.id);
    return this;
  },
  updateActiveUI: function() {
    this.$el.toggleClass('selected', this.model.get('active'));
  },
  setActiveLayout: function() {
    this.model.set('active', true);
  }
});


/*
* Extending backbone model with nestCollection.
*/
Backbone.Model.prototype.nestCollection = function(model, attributeName, nestedCollection) {
  //setup nested references
  for (var i = 0; i < nestedCollection.length; i++) {
    model.attributes[attributeName][i] = nestedCollection.at(i).attributes;
  }

  //create empty arrays if none
  nestedCollection.on('add', function (initiative) {
    if (!model.get(attributeName)) {
      model.attributes[attributeName] = [];
    }
    model.get(attributeName).push(initiative.attributes);
  });

  nestedCollection.on('remove', function (initiative) {
    var updateObj = {};
    updateObj[attributeName] = _.without(model.get(attributeName), initiative.attributes);
    model.set(updateObj);
  });

  return nestedCollection;
}
