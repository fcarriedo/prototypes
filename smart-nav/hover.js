
// Event bus
eventBus = {};
_.extend(eventBus, Backbone.Events);

// Models
Product = Backbone.Model.extend({});
Page = Backbone.Model.extend({defaults: function() {active: false}});
Bullet = Backbone.Model.extend({});

// Collections
ProductList = Backbone.Collection.extend({
  model: Product,
  prodsPerPage: 2,
});

// Views
ProductListView = Backbone.View.extend({
  el: $('#page-viewport'),
  initialize: function() {
    this.$bulletContainer = $('#bullet-container').hide();
    this.totalPages = Math.ceil(this.collection.length/this.collection.prodsPerPage);
    if(this.totalPages > 1) this.$bulletContainer.show(); // Only show when there is more than one page

    // Pages array
    this.pages = [];
    eventBus.on('pageActivated', this.onPageActivated, this);
  },
  onPageActivated: function(pgId) {
    _.each(this.pages, function(page) {
      if(page.id != pgId) page.set('active', false);
    });
  },
  render: function() {
    // Create the pages
    var pageViews = [];
    for(pageIx in _.range(this.totalPages)) {
      var page = new Page({id: pageIx});
      var pageView = new PageView({model: page});
      var bulletView = new BulletView({model: page});

      this.$el.append(pageView.render().el);
      this.$bulletContainer.append(bulletView.render().el);

      pageViews.push(pageView);
      this.pages.push(page);
    }

    // Fill them with products
    var pgIx = -1;
    this.collection.each(function(prod, ix) {
      if((ix % this.collection.prodsPerPage) === 0) pgIx++;
      pageViews[pgIx].$el.append(new ProductView({model: prod}).render().el);
    }, this);

    // Set the first page as active
    if(this.pages) this.pages[0].set('active', true);

    return this;
  },
});
PageView = Backbone.View.extend({
  className: 'page',
  hovered: false,
  hoverDelay: 350,
  initialize: function() {
    this.listenTo(this.model, 'change:active', this.onActiveChange);
  },
  render: function() {
    this.$el.attr('id', 'page-' + this.model.id);
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
        //console.log('updated...');
      },
      receive: function(evt, ui) {
        console.log('received from: ' + ui.sender.attr('id'));
      }
    });
    return this;
  },
  setActive: function() {
    this.model.set('active', true);
    // Trigger the pageActivated event
    eventBus.trigger('pageActivated', this.model.id);
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
ProductView = Backbone.View.extend({
  className: 'product',
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
    // Trigger the pageActivated event
    eventBus.trigger('pageActivated', this.page.id);
  },
  onActiveChange: function() {
    if(this.page.get('active')) {
      this.$el.addClass('selected');
    } else {
      this.$el.removeClass('selected');
    }
  }
});
