
// Event bus
eventBus = {};
_.extend(eventBus, Backbone.Events);

// Models
Product = Backbone.Model.extend({});
Page = Backbone.Model.extend({
  defaults: function() { return{ active: false, maxProducts: 2} },
  initialize: function(){
    this.products = this.nestCollection(this, 'products', new ProductList(this.get('products')));
  }
});
Bullet = Backbone.Model.extend({});
Layout = Backbone.Model.extend({
  defaults: function() { return{ layoutId: 'default', prodsPerPage: 2} },
});

// Collections
ProductList = Backbone.Collection.extend({model: Product});
PageList = Backbone.Collection.extend({model: Page});

// Views
PageView = Backbone.View.extend({
  className: 'page',
  hovered: false,
  hoverDelay: 350,
  events: {
    'click' : 'setActive'
  },
  initialize: function() {
    this.listenTo(this.model, 'change:active', this.onActiveChange);

    // TODO: Check if we can minimize renders later
    this.model.products.on('add remove reset', this.render, this);

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
    this.$el.html('');
    this.model.products.each(function(prod) {
      this.$el.append(new ProductView({model: prod}).render().el);
    }, this);
    return this;
  },
  setActive: function() {
    this.model.set('active', true);
  },
  onActiveChange: function() {
    if(this.model.get('active')) {
      // Trigger the pageActivated event
      eventBus.trigger('pageActivated', this.model.id);

      this.$el.addClass('active');
      // Perform the actual slide
      $('#page-viewport').scrollTo('#'+this.$el.attr('id'), 250, {over: -0.12});
    } else {
      this.$el.removeClass('active');
    }
  }
});
PageListView = Backbone.View.extend({
  el: $('#page-viewport'),
  initialize: function() {
    this.$bulletContainer = $('#bullet-container');
    this.showHideBullets();

    // Listeners
    this.listenTo(this.collection, 'add remove', this.showHideBullets);
    // Listening for the event bus 'pageActivated' event
    eventBus.on('pageActivated', this.onPageActivated, this);

    this.pageViews = [];
    this.bulletViews = [];
    this.collection.each(function(page) {
      this.pageViews.push(new PageView({model: page}));
      this.bulletViews.push(new BulletView({model: page}));
    }, this);
  },
  onPageActivated: function(pgId) {
    this.collection.each(function(page) {
      if(page.id != pgId) page.set('active', false);
    });
  },
  showHideBullets: function() {
    this.$bulletContainer.toggle(this.collection.length > 1);
  },
  render: function() {
    for(var i=0; i<this.pageViews.length; i++) {
      this.$el.append(this.pageViews[i].render().el);
      this.$bulletContainer.append(this.bulletViews[i].render().el);
    }

    // Set the first page as active if none active pages exist
    if(this.collection.every(function(page) { return page.get('active') === false})) {
      this.collection.get(0).set('active', true);
    }

    return this;
  },
});
ProductView = Backbone.View.extend({
  className: 'product',
  initialize: function() {
    this.$el.attr('id', 'sku-' + this.model.get('sku'));
    this.$el.data('model', this.model);
  },
  render: function() {
    this.$el.html('<span class="product-info">sku: ' + this.model.get('sku') + '</span>');
    return this;
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
    this.listenTo(this.page, 'change:active', this.onActiveChange);
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
  initialize: function(options) {
    var layout = new Layout();
    var prodsPerPage = parseInt(layout.get('prodsPerPage'));
    var totalPages = Math.ceil(this.collection.length/prodsPerPage);

    var pageList = new PageList();
    var prodsArray = this.collection.toArray();
    for(pgIx in _.range(totalPages)) {
      var initProdIx = pgIx*prodsPerPage;
      var prods = prodsArray.slice(initProdIx, initProdIx+prodsPerPage);

      // Create the productList for the page
      var prodsList = new ProductList().reset(prods);

      // Create all the pages and add them to the page list
      var page = new Page({id: pgIx, layout: layout});
      page.products = prodsList;
      pageList.add(page);
    }
    new PageListView({collection: pageList, layout: layout}).render();
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
