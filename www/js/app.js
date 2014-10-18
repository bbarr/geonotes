
var UUID = '' 

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
          radius: 1000
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
          note.score += dec
          notes.child(note.name).update({ score: note.score })
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
          note.score += inc
          notes.child(note.name).update({ score: note.score })
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
        note.metersAway = Math.round(GeoFire.distance(note.location, currentUserLocation) * 1000)
      })
      currentUserLocation = ll
      currentArea.updateCriteria({ center: ll })
      $scope.safeApply()
    })

    function prepareSnapshotForList(snap) {

      var note = snap.val()
      if (note) {

        note.name = snap.name()

        var existing = _.find($scope.notes, { name: note.name })
        if (existing) _.extend(existing, note)
        else $scope.notes.push(note)

        note.metersAway = Math.round(GeoFire.distance(note.location, currentUserLocation) * 1000)
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

    // Called when the form is submitted
    $scope.createNote = function(raw) {
      var note = {
        text: raw.text,
        location: currentUserLocation,
        score: 10
      }
      $scope.noteModal.hide();
      raw.text = "";
      var created = NoteService.fbNotes.push(note)
      NoteService.fbGeo.set(created.name(), note.location)
    };

    $scope.downvote = function(note) {
      NoteService.downVote(note, $scope)
      $ionicListDelegate.closeOptionButtons()
    }

    function upvote(note) {
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
    $scope.newNote = function() {
      $scope.noteModal.show();
    };

    // Close the new note modal
    $scope.closeNewNote = function() {
      $scope.noteModal.hide();
    };
  })
