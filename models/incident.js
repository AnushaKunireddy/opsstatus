"use strict";

var _ = require('lodash');
var modb = require('mongoose');
var moment = require('moment');
var Promise = require('bluebird');
var V = require('validator-as-promised')
var Vc = require('../modules/validators');

/**
 * Incident Schema
 *
 * @type       {Object}
 */
var incidentSchema = modb.Schema({

  summary: {
    type: String,
    required: true
  },
  kind: {
    type: String,
    required: true,
    index: true,
    enum: ['unplanned','scheduled'],
    default: 'unplanned'
  },
  state: {
    type: String,
    required: true,
    index: true,
    enum: ['open','scheduled','closed'],
    default: 'open'
  },
  regions: [{
    type: String,
    ref: 'Region'
  }],
  component: {
    type: modb.Schema.Types.ObjectId,
    ref: 'Component',
    required: true
  },
  author: {
    type: modb.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  schedule: {
    plannedStartDate: {
      type: Date
    },
    plannedEndDate: {
      type: Date
    },
    actualStartDate: {
      type: Date
    },
    actualEndDate: {
      type: Date
    }
  },
  updates: [{
    summary: {
      type: String,
      required: true
    },
    content: {
      type: String,
      required: true
    },
    postedDate: {
      type: Date,
      required: true
    },
    author: {
      type: modb.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      required: true
    }
  }]

},
{
  timestamps: {}
});

/**
 * MODEL - Create a new incident
 *
 * @param      {Object}   data    Data of the new incident
 * @return     {Promise}  Promise of the create operation
 */
incidentSchema.statics.new = function(data) {

  let isScheduled = data.type === 'scheduled';
  let nSummary = _.trim(data.summary);
  let nState = (isScheduled) ? 'scheduled' : 'open';
  let nRegions = JSON.parse(data.regions);
  let nTimezone = data.timezone || 'UTC';

  // Validate input data

  return Promise.all([
    V.isLengthAsync('Invalid or missing summary.', nSummary, { min: 3, max:255 }),
    V.isInAsync('Invalid incident type.', data.type, ['unplanned','scheduled']),
    V.isMongoIdAsync('Invalid component selection.', data.component),
    V.custom('At least 1 region required.', Vc.isArray, nRegions),
    V.isLengthAsync('Invalid or missing content.', data.content, 2)
  ]).then(() => {

    return db.Component.findById(data.component).then((comp) => {

      // Verify if component exists

      if(!comp) {
        throw new Error('Invalid component.');
      }

      // Set schedule properties

      let nSchedule = {};

      if(isScheduled) {
        nSchedule.plannedStartDate = moment.tz(data.schedule_planned_start + ' ' + data.schedule_planned_start_time, 'YYYY/MM/DD HH:mm', nTimezone).utc().toDate();
        nSchedule.plannedEndDate = moment.utc(data.schedule_planned_end + ' ' + data.schedule_planned_end_time, 'YYYY/MM/DD HH:mm', nTimezone).utc().toDate();
        
        if(!moment(nSchedule.plannedStartDate).isBefore(nSchedule.plannedEndDate)) {
          throw new Error('End date cannot be before Start date.')
        }

        data.componentState = 'scheduled';

      } else {
        nSchedule.actualStartDate = moment.tz(data.schedule_actual_start + ' ' + data.schedule_actual_start_time, 'YYYY/MM/DD HH:mm', nTimezone).utc().toDate();
      }

      // Verify datetime objects

      if( !_.every(nSchedule, (s) => { console.log(s); return _.isDate(s) && !_.isNaN(s.valueOf()); }) ) {
        throw new Error('Invalid or missing date/time.');
      }

      return nSchedule;

    });

  }).then((nSchedule) => {

    // Create incident

    return this.create({
      _id: db.ObjectId(),
      summary: nSummary,
      kind: data.type,
      state: nState,
      regions: nRegions,
      component: data.component,
      author: data.userId,
      schedule: nSchedule,
      updates: [{
        summary: nSummary,
        content: data.content,
        postedDate: moment().utc().toDate(),
        author: data.userId,
        status: 'Identified'
      }]
    });

  }).then((nInc) => {

    // Change component state

    if(data.componentState !== 'unchanged') {
      return db.Component.findByIdAndUpdate(data.component, {
        state: data.componentState
      }, {
        runValidators: true
      });
    }
    
    return nInc;

  });
  
};

module.exports = modb.model('Incident', incidentSchema);