
// Event bus
eventBus = {};
_.extend(eventBus, Backbone.Events);

// Models
Product = Backbone.Model.extend({});
Page = Backbone.Model.extend({
  defaults: function() { return{active: false} },
  initialize: function(){
    this.products = this.nestCollection(this, 'products', new ProductList(this.get('products')));
  }
});
Bullet = Backbone.Model.extend({});
Layout = Backbone.Model.extend({
  defaults: function() { return{ id: 'default', prodsPerPage: 4, active: false} },
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
  events: {
    'click' : 'setActive'
  },
  initialize: function() {
    this.model.on('change:active', this.onActiveChange, this);

    // TODO: Check if we can minimize renders later
    this.model.products.on('add remove reset', this.render, this);

    this.model.on('change:layout', this.render, this);

    this.$el.attr('id', 'page-' + this.model.id);
    this.$el.data('model', this.model);
    var self = this;
    this.$el.sortable({
      connectWith: '.page',
      items: '.product',
      tolerance: 'pointer',
      revert: true,
      over: function(evt, ui) {
        self.hovered = true;
        setTimeout(function() {
          if(self.hovered) {
            self.setActive();
          }
        }, self.hoverDelay);
      },
      out: function(evt, ui) {
        self.hovered = false;
      },
      update: function(evt, ui) {
        // We check the prods that exist on the current page and update it (reset).
        var prodsTmp = [];
        self.$el.find('.product').each(function(ix) {
          prodsTmp.push( $(this).data('model') );
        });
        self.model.products.reset(prodsTmp);

        if(ui.sender) {
          var srcPage = ui.sender.data('model');
          if(srcPage.id < self.model.id) {
            // Came from a previous page. Should take the first one and append it to the source page.
            var shiftProd = self.model.products.shift();
            srcPage.products.push(shiftProd);
          } else {
            // Came from a further page. Should take the last one and preppend it to the source page.
            var popProd = self.model.products.pop();
            srcPage.products.unshift(popProd);
          }
        }
      }
    });
  },
  render: function() {
    if(this.model.products.isEmpty()) {
      // If there are no products to hold, we delete it.
      this.model.id = null;
      this.model.destroy();
      var self = this;
      this.$el.fadeOut(function() {
        self.remove();
      });
    } else {
      this.$el.html('');

      var layout = this.model.get('layout');
      var layoutTmpl = $('#' + layout.id).clone();

      this.$el.html(layoutTmpl.html());
      var $prodContainer = this.$el.find('.prod-container-' + layout.id);

      this.model.products.each(function(prod) {
        $prodContainer.append(new ProductView({model: prod}).render().el);
      }, this);
    }

    return this;
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
  }
});
// TODO: Rewrite the rendering
PageListView = Backbone.View.extend({
  el: $('#page-viewport'),
  initialize: function() {
    this.$bulletContainer = $('#bullet-container');
    this.showHideBullets();

    eventBus.on('toolbarSpaceClicked', this.addEmptyProd, this);

    // Listeners
    this.collection.on('add', this.addPage, this);
    // Listening to page active change
    this.collection.on('change:active', this.onPageActivated, this);
    // When destroying a page, set the last existing page as active.
    this.collection.on('destroy', this.setActivePageIfNecessary, this);
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
      var newPage = new Page({id: lastPage.id+1, layout: layout});
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
  setActivePageIfNecessary: function(deletingPage) {
    if(deletingPage.get('active')) {
      this.collection.at(this.collection.length-1).set('active', true);
    }
  }
});
ProductView = Backbone.View.extend({
  className: 'product',
  events: {
    'mouseenter'   : 'showActions',
    'mouseleave'   : 'hideActions',
    'click .close' : 'deleteEmptyProd'
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
      this.$el.html('<span class="product-info">empty</span><span class="close hide" title="delete">x</span>');
    }
    return this;
  },
  deleteEmptyProd: function() {
    this.model.destroy();
  },
  showActions: function() {
    this.$('.close').show();
  },
  hideActions: function() {
    this.$('.close').hide();
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
  el: $('#layout-toolbar'),
  initialize: function() {
    this.collection.on('change:active', this.updateActiveLayout, this);
  },
  render: function() {
    this.collection.each(function(layout) {
      this.$el.append(new LayoutView({model: layout}).render().el);
    }, this);
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