L.Toolbar.Control = L.Toolbar.extend({
	statics: {
		baseClass: 'leaflet-control-toolbar ' + L.Toolbar.baseClass
	},

	initialize: function(options) {
		L.Toolbar.prototype.initialize.call(this, options);

		this._control = new L.Control.Toolbar(this.options);
	},

	onAdd: function(map) {
		this._control.addTo(map);

		L.Toolbar.prototype.onAdd.call(this, map);

		this.appendToContainer(this._control.getContainer());
	},

	onRemove: function(map) {
		L.Toolbar.prototype.onRemove.call(this, map);
		if (this._control.remove) {this._control.remove();}  // Leaflet 1.0
		else {this._control.removeFrom(map);}
	}
});

L.Edit = L.Edit || {};
L.Edit.Control = L.Edit.Control || {};

L.Edit.Control.Delete = L.ToolbarAction.extend({
	statics: {
		TYPE: 'remove' // not delete as delete is reserved in js
	},

	options: {
		toolbarIcon: { className: 'leaflet-draw-edit-remove' }
	},

	includes: L.Mixin.Events,

	initialize: function (map, options) {
		L.ToolbarAction.prototype.initialize.call(this, map);

		L.Util.setOptions(this, options);

		// Store the selectable layer group for ease of access
		this._deletableLayers = this.options.featureGroup;
		this._map = map;

		if (!(this._deletableLayers instanceof L.FeatureGroup)) {
			throw new Error('options.featureGroup must be a L.FeatureGroup');
		}

		// Save the type so super can fire, need to do this as cannot do this.TYPE :(
		this.type = this.constructor.TYPE;
	},

	enable: function () {
		if (this._enabled || !this._hasAvailableLayers()) {
			return;
		}
		this.fire('enabled', { handler: this.type});

		this._map.fire('draw:deletestart', { handler: this.type });

		L.ToolbarAction.prototype.enable.call(this);

		this._deletableLayers
			.on('layeradd', this._enableLayerDelete, this)
			.on('layerremove', this._disableLayerDelete, this);
	},

	disable: function () {
		if (!this._enabled) { return; }

		this._deletableLayers
			.off('layeradd', this._enableLayerDelete, this)
			.off('layerremove', this._disableLayerDelete, this);

		L.ToolbarAction.prototype.disable.call(this);

		this._map.fire('draw:deletestop', { handler: this.type });

		this.fire('disabled', { handler: this.type});
	},

	addHooks: function () {
		var map = this._map;

		if (map) {
			map.getContainer().focus();

			this._deletableLayers.eachLayer(this._enableLayerDelete, this);
			this._deletedLayers = new L.layerGroup();

			this._tooltip = new L.Tooltip(this._map);
			this._tooltip.updateContent({ text: L.drawLocal.edit.handlers.remove.tooltip.text });

			this._map.on('mousemove', this._onMouseMove, this);
		}
	},

	removeHooks: function () {
		if (this._map) {
			this._deletableLayers.eachLayer(this._disableLayerDelete, this);
			this._deletedLayers = null;

			this._tooltip.dispose();
			this._tooltip = null;

			this._map.off('mousemove', this._onMouseMove, this);
		}
	},

	revertLayers: function () {
		// Iterate of the deleted layers and add them back into the featureGroup
		this._deletedLayers.eachLayer(function (layer) {
			this._deletableLayers.addLayer(layer);
			layer.fire('revert-deleted', { layer: layer });
		}, this);
	},

	save: function () {
		this._map.fire('draw:deleted', { layers: this._deletedLayers });
	},

	_enableLayerDelete: function (e) {
		var layer = e.layer || e.target || e;

		layer.on('click', this._removeLayer, this);
	},

	_disableLayerDelete: function (e) {
		var layer = e.layer || e.target || e;

		layer.off('click', this._removeLayer, this);

		// Remove from the deleted layers so we can't accidently revert if the user presses cancel
		this._deletedLayers.removeLayer(layer);
	},

	_removeLayer: function (e) {
		var layer = e.layer || e.target || e;

		this._deletableLayers.removeLayer(layer);

		this._deletedLayers.addLayer(layer);

		layer.fire('deleted');
	},

	_onMouseMove: function (e) {
		this._tooltip.updatePosition(e.latlng);
	},

	_hasAvailableLayers: function () {
		return this._deletableLayers.getLayers().length !== 0;
	}
});


L.EditToolbar.Control = L.Toolbar.Control.extend({
	options: {
		actions: [
			L.Edit.Control.Edit,
			L.Edit.Control.Delete
		],
		className: 'leaflet-draw-toolbar'
	},

	/* Accomodate Leaflet.draw design decision to pass featureGroup as an option rather than a parameter. */
	_getActionConstructor: function (Action) {
		var map = this._arguments[0],
			featureGroup = this._arguments[1],
			A = L.Toolbar.prototype._getActionConstructor.call(this, Action);

		return A.extend({
			options: { featureGroup: featureGroup },
			initialize: function () {
				Action.prototype.initialize.call(this, map);
			}
		});
	}
});

L.EditToolbar.Save = L.ToolbarAction.extend({
	options: {
		toolbarIcon: { html: 'Save' }
	},
	initialize: function (map, featureGroup, editing) {
		this.editing = editing;
		L.ToolbarAction.prototype.initialize.call(this);
	},
	addHooks: function () {
		this.editing.save();
		this.editing.disable();
	}
});

L.EditToolbar.Undo = L.ToolbarAction.extend({
	options: {
		toolbarIcon: { html: 'Undo' }
	},
	initialize: function (map, featureGroup, editing) {
		this.editing = editing;
		L.ToolbarAction.prototype.initialize.call(this);
	},
	addHooks: function () {
		this.editing.revertLayers();
		this.editing.disable();
	}
});

/* Enable save and undo functionality for edit and delete modes. 
L.setOptions(L.Edit.Control.Delete.prototype, {
	subToolbar: new L.Toolbar({ actions: [L.EditToolbar.Save, L.EditToolbar.Undo] })
});

L.setOptions(L.Edit.Control.Edit.prototype, {
	subToolbar: new L.Toolbar({ actions: [L.EditToolbar.Save, L.EditToolbar.Undo] })
});
*/

L.Edit = L.Edit || {};
L.Edit.Popup = L.Edit.Popup || {};

L.Edit.Popup.Edit = L.ToolbarAction.extend({
	options: {
		toolbarIcon: { className: 'leaflet-draw-edit-edit' }
	},

	initialize: function (map, shape, options) {
		this._map = map;

		this._shape = shape;
		this._shape.options.editing = this._shape.options.editing || {};

		L.ToolbarAction.prototype.initialize.call(this, map, options);
	},

	enable: function () {
		var map = this._map,
			shape = this._shape;

		shape.editing.enable();
		map.removeLayer(this.toolbar);
		
		map.on('click', function () {
			shape.editing.disable();
		});
	}
});

L.Edit = L.Edit || {};
L.Edit.Popup = L.Edit.Popup || {};

L.Edit.Popup.Delete = L.ToolbarAction.extend({
	options: {
		toolbarIcon: { className: 'leaflet-draw-edit-remove' }
	},

	initialize: function (map, shape, options) {
		this._map = map;
		this._shape = shape;

		L.ToolbarAction.prototype.initialize.call(this, map, options);
	},

	addHooks: function () {
		this._map.removeLayer(this._shape);
		this._map.removeLayer(this.toolbar);
	}
});


L.EditToolbar.Popup = L.Toolbar.Popup.extend({
	options: {
		actions: [
			L.Edit.Popup.Edit,
			L.Edit.Popup.Delete
		]
	},

	onAdd: function (map) {
		var shape = this._arguments[1];

		if (shape instanceof L.Marker) {
			/* Adjust the toolbar position so that it doesn't cover the marker. */
			this.options.anchor = L.point(shape.options.icon.options.popupAnchor);
		}

		L.Toolbar.Popup.prototype.onAdd.call(this, map);
	}
});