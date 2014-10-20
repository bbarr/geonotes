
var UUID = ''

var FEET_IN_METER = 3.28084
var FEET_IN_MILE = 5280

function metersToFeet(m) {
  return m * FEET_IN_METER
}

function metersToMiles(m) {
  return Math.round((metersToFeet(m) / FEET_IN_MILE) * 100) / 100
}

function kmToMiles(km) {
  return metersToMiles(km * 1000)
}

angular.module('geo-notes', ['ionic', 'ngCordova'])

  .factory('NoteService', function() {

    var fb = new Firebase("https://sweltering-fire-1231.firebaseio.com")
    var notes = fb.child('notes')
    var geos = fb.child('geos')
    var devices = fb.child('devices')
    var geo = new GeoFire(geos)

    return {

      fbNotes: notes,
      fbGeos: geos,
      fbGeo: geo,

      byArea: function() {
        return geo.query({
          center: [ 0, 0 ],
          radius: 10
        })
      },

      voteStatusFor: function(note, cb) {
        var name = note.name
        devices.child(UUID).once('value', function(snap) {
          var d = snap.val()
          cb(d.hearts[name] || 0)
        })
      },

      downVote: function(note, scope) {
        devices.child(UUID).once('value', function(snap) {
          var d = snap.val()
          if (d && d.hearts && d.hearts[note.name] == -1) return

          var dec = (d && d.hearts && d.hearts[note.name] == 1) ? -2 : -1

          // update device tracking
          var delta = {}
          delta[note.name] = -1
          snap.ref().child('hearts').update(delta)

          // save actual note data
          note.hearts += dec
          notes.child(note.name).update({ hearts: note.hearts })
        })
      },

      upVote: function(note) {
        devices.child(UUID).once('value', function(snap) {
          var d = snap.val()
          if (d && d.hearts && d.hearts[note.name] == 1) return

          var inc = (d && d.hearts && d.hearts[note.name] == -1) ? 2 : 1

          // update device tracking
          var delta = {}
          delta[note.name] = 1
          snap.ref().child('hearts').update(delta)

          // save actual note data
          note.hearts += inc
          notes.child(note.name).update({ hearts: note.hearts })
        })
      },

      fetch: function() {

      },

      create: function(raw) {
      }
    }
  })

  .controller('GeoNotesController', function($scope, $ionicListDelegate, $ionicGesture, $ionicPlatform, $ionicModal, $cordovaGeolocation, NoteService) {

    $scope.safeApply = function(fn) {
      var phase = this.$root.$$phase;
      if(phase == '$apply' || phase == '$digest') {
        if(fn && (typeof(fn) === 'function')) {
          fn();
        }
      } else {
        this.$apply(fn);
      }
    };

    // track user location
    $ionicPlatform.ready(function() {
      UUID = ionic.Platform.device().uuid || 'Mobile Browser probably us testing'
      $cordovaGeolocation
        .watchPosition({
          frequency : 1000,
          timeout : 5000,
          enableHighAccuracy: true
        })
        .promise.then(function() { /*done*/ }, function() { /*error*/ }, userLocation.emit.bind(userLocation))
    })

    // this is where we store our notes
    $scope.notes = [];

    var currentUserLocation
    var currentArea = NoteService.byArea()

    var llArray = function(pos) { return [ pos.coords.latitude, pos.coords.longitude ] }

    var userLocation = Kefir.emitter()
    userLocation.map(llArray).onValue(function(ll) {
      $scope.notes.forEach(function(note) {
        note.distanceAway = kmToMiles(GeoFire.distance(note.location, currentUserLocation))
      })
      currentUserLocation = ll
      currentArea.updateCriteria({ center: ll })
      $scope.safeApply()
    })

    function updateNoteStatus(note) {
      NoteService.voteStatusFor(note, function(status) {
        note.voteStatus = status
        $scope.safeApply()
      })
    }

    function prepareSnapshotForList(snap) {

      var note = snap.val()
      if (note) {

        note.name = snap.name()
        console.log('snapshotting')

        var existing = _.find($scope.notes, { name: note.name })
        if (existing) _.extend(existing, note)
        else $scope.notes.push(note)

        note.distanceAway = kmToMiles(GeoFire.distance(note.location, currentUserLocation))

        updateNoteStatus(note)

        $scope.notes = $scope.notes.sort(function(a, b) {
          return a.distanceAway > b.distanceAway
        })
      } else {
        $scope.notes = $scope.notes.filter(function(note) { return note.name !== snap.name() })
      }

      $scope.safeApply()
    }

    currentArea.on('key_entered', function(k, l, d) {
      NoteService.fbNotes.child(k).on('value', prepareSnapshotForList)
    })

    currentArea.on('key_exited', function(k) {

      // remove from local notes
      $scope.notes = $scope.notes.filter(function(note) {
        return note.name !== k
      })

      NoteService.fbNotes.child(k).off('value')
    })

    // Create and load the Modal
    $ionicModal.fromTemplateUrl('new-note.html', function(modal) {
      $scope.noteModal = modal;
    }, {
      scope: $scope,
      animation: 'slide-in-up'
    });

    $scope.canSwipe = true;

    $scope.selectType = function(note, type) {
      note.type = type
    }

    // Called when the form is submitted
    $scope.createNote = function(raw) {
      var note = {
        text: raw.text,
        type: raw.type,
        location: currentUserLocation,
        life: 14400, // one week in minutes
        hearts: 0
      }
      $scope.noteModal.hide();
      raw.text = "";
      var created = NoteService.fbNotes.push(note)
      NoteService.fbGeo.set(created.name(), note.location)
    };

    $scope.downvote = function(note) {
      note.voteStatus = -1
      NoteService.downVote(note, $scope)
      $ionicListDelegate.closeOptionButtons()
    }

    function upvote(note) {
      note.voteStatus = 1
      NoteService.upVote(note)
    }

    var lastUpvoteClick = null
    var lastUpvoteTimer = null
    $scope.upvote = function(note, dbltap) {
      if (dbltap) {
        if (!lastUpvoteClick || lastUpvoteClick !== this.$id) {
          lastUpvoteTimer = setTimeout(function() {
            lastUpvoteClick = null
            clearTimeout(lastUpvoteTimer)
          }, 300)
          return lastUpvoteClick = this.$id
        } else {
          lastUpvoteClick = null
          clearTimeout(lastUpvoteTimer)
          upvote(note)
        }
      } else {
        upvote(note)
      }
    }

    // Open our new note modal
    $scope.showNewNoteForm = function() {
      $scope.newNote = {
        type: 'note',
        text: ''
      }
      $scope.noteModal.show();
    };

    // Close the new note modal
    $scope.closeNewNote = function() {
      $scope.noteModal.hide();
    };
  })
