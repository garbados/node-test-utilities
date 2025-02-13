/*
 * Copyright 2020 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

var _ = require('lodash')
var TestAgent = require('./agent')
var testUtil = require('./util')
var util = require('util')

var Transaction = require(testUtil.getNewRelicLocation() + '/lib/transaction')

/**
 * @namespace assert
 */
var assert = module.exports

/**
 * Extends Tap with more assert specific to testing transactions.
 *
 * @param {Tap} tap - The Tap module as returned by `require('tap')`.
 */
assert.extendTap = function extendTap(tap) {
  var addAssert = tap.Test.prototype.addAssert.bind(tap.Test.prototype)
  addAssert('transaction', 1, _tapper1(_transactionTest))

  addAssert('metrics', 1, _tapper1(_metricsTest))
  addAssert('exactMetrics', 1, _tapper1(_exactMetricsTest))

  addAssert('segments', 2, _tapper2(_segmentsTest))
  addAssert('exactSegments', 2, _tapper2(_exactSegmentsTest))
}

/**
 * Asserts that the provided object is a transaction and is the currently active
 * transaction.
 *
 * @function
 *
 * @param {*}       tx        - The object to test as a transaction.
 * @param {string}  [message] - Optional message for the assertion.
 */
assert.transaction = _asserter1(_transactionTest)

/**
 * Asserts that the metrics are roughly the same shape as expected.
 *
 * @function
 *
 * @param {Array.<(string|Object)>} expected
 *  Array of expected metrics. Any value that is a string will just be checked
 *  against a metric name.
 *
 * @param {string} expected[].name
 *  The name of the metric.
 *
 * @param {string} [expected[].scope]
 *  Optional scope that the metric can be found in.
 *
 * @param {number} [expected[].min]
 *  Optional metric value to check.
 *
 * @param {number} [expected[].max]
 *  Optional metric value to check.
 *
 * @param {number} [expected[].sumOfSquares]
 *  Optional metric value to check.
 *
 * @param {number} [expected[].callCount]
 *  Optional metric value to check.
 *
 * @param {number} [expected[].total]
 *  Optional metric value to check.
 */
assert.metrics = _asserter1(_metricsTest)

/**
 * Asserts that only the given metrics were recorded and no others.
 *
 * @function
 *
 * @param {Array.<(string|Object)>} expected
 *  Array of expected metrics. Any value that is a string will just be checked
 *  against a metric name.
 *
 * @param {string} expected[].name
 *  The name of the metric.
 *
 * @param {string} [expected[].scope]
 *  Optional scope that the metric can be found in.
 *
 * @param {number} [expected[].min]
 *  Optional metric value to check.
 *
 * @param {number} [expected[].max]
 *  Optional metric value to check.
 *
 * @param {number} [expected[].sumOfSquares]
 *  Optional metric value to check.
 *
 * @param {number} [expected[].callCount]
 *  Optional metric value to check.
 *
 * @param {number} [expected[].total]
 *  Optional metric value to check.
 */
assert.exactMetrics = _asserter1(_exactMetricsTest)

/**
 * Asserts that the segments are roughly structured as expected.
 *
 * Ordering of children as well as amount of children are not considered as part
 * of this assertion. In addition, the name is only loosely matched; the segment
 * name need only _contain_ the provided string.
 *
 * @function
 *
 * @param {TraceSegment} parent
 *  The segment to check the children of.
 *
 * @param {Object[]} expected
 *  The expected children.
 *
 * @param {string|RegExp} expected[].name
 *  The name of the segment. If a string, then `indexOf` will be used to compare
 *  segment names.
 *
 * @param {Object[]} expected[].children
 *  An array of expected children. This should match the same structure as the
 *  `expected` parameter.
 *
 * @param {bool} [expected[].exact=false]
 *  Indicates if the children should be matched exactly. If `exact: true` is
 *  given then from these children on, until `exact: false` is specified,
 *  segments will be compared strictly.
 */
assert.segments = _asserter2(_segmentsTest)

/**
 * Asserts that the segments are exactly structured as expected.
 *
 * Ordering of children as well as the amount of children are strictly checked
 * as part of this assertion. In addition, the name must be provided in full.
 *
 * @function
 *
 * @param {TraceSegment} parent
 *  The segment to check the children of.
 *
 * @param {Object[]} expected
 *  The expected children.
 *
 * @param {string} expected[].name
 *  The full and exact name of the segment.
 *
 * @param {Object[]} expected[].children
 *  An array of all expected children. This should match the same structure as
 *  the `expected` parameter.
 *
 * @param {bool} [expected[].exact=true]
 *  Indicates if the children should be matched exactly. If `exact: false` is
 *  given then from these children on, until `exact: true` is specified,
 *  segments will be compared loosely.
 */
assert.exactSegments = _asserter2(_exactSegmentsTest)

function _transactionTest(tx) {
  var currentTx = TestAgent.instance && TestAgent.instance.getTransaction()
  var txName = tx ? tx.id : '<null>'
  var currentName = currentTx ? currentTx.id : '<null>'
  if (tx == null) {
    return { message: 'Transaction is ' + txName }
  } else if (!(tx instanceof Transaction)) {
    return { message: 'Transaction is not an instance of Transaction class.' }
  } else if (!currentTx || tx.id !== currentTx.id) {
    return {
      message: util.format(
        'Transaction (%s) is not the current transaction (%s)',
        txName,
        currentName
      )
    }
  }

  return { success: true, message: 'Transaction is ' + txName }
}

function _metricsTest(expected, exact) {
  var metrics = TestAgent.instance.agent.metrics

  for (var i = 0; i < expected.length; ++i) {
    var expectedMetric = _.clone(expected[i])
    var name = null
    var scope = null

    if (_.isString(expectedMetric)) {
      name = expectedMetric
      expectedMetric = {}
    } else {
      name = expectedMetric.name
      scope = expectedMetric.scope
      delete expectedMetric.name
      delete expectedMetric.scope
    }

    var metric = metrics.getMetric(name, scope)
    if (!metric) {
      return {
        message: util.format('Missing metric named "%s" in scope %s', name, scope || '<null>')
      }
    }

    // Note that if expectedMetric is empty (i.e. only name and scope given)
    // then this `isMatch` will be true, effectively disabling this check.
    if (!_.isMatch(metric, expectedMetric)) {
      return { message: util.format('Metric %s does not match expected.', name) }
    }
  }

  let metricsJSON = metrics._metrics.toJSON()
  if (exact && metricsJSON.length !== expected.length) {
    return {
      message: util.format(
        'Metric has %d elements, expected %d.',
        metricsJSON.length,
        expected.length
      )
    }
  }

  return {
    success: true,
    message: 'Metrics are ' + (exact ? 'exactly' : 'loosely') + ' as expected.'
  }
}

function _exactMetricsTest(expected) {
  return _metricsTest(expected, true)
}

function _segmentsTest(parent, _expected) {
  // expected:
  //  [{name: "name", children: [{name: "child"}]}]
  var stack = [[parent.children, _expected]]

  function findFirstChild(children, name) {
    return children.find((child) => {
      if (name instanceof RegExp) {
        return name.test(child.name)
      }
      return child.name.indexOf(name) >= 0
    })
  }

  function findMatchingChildren(children, name) {
    return children.filter((child) => {
      if (name instanceof RegExp) {
        return name.test(child.name)
      }
      return child.name.indexOf(name) >= 0
    })
  }

  while (stack.length) {
    var current = stack.pop()
    var children = current[0]
    var expected = current[1]

    for (var i = 0; i < expected.length; ++i) {
      var expectedChild = expected[i]

      const matches = findMatchingChildren(children, expectedChild.name)

      let child = matches[0]
      if (matches.length > 1 && expectedChild.children) {
        // pre-test first grand-child to find appropriate match
        const firstMatchingChild = matches.find((matchChild) => {
          const firstGrandchildTest = expectedChild.children[0]
          const grandchild = findFirstChild(matchChild.children, firstGrandchildTest.name)
          return grandchild
        })

        child = firstMatchingChild || child
      }

      if (!child) {
        return { message: util.format('Missing child segment "%s"', expectedChild.name) }
      }

      if (expectedChild.children) {
        if (expectedChild.exact) {
          var res = _exactSegmentsTest(child, expectedChild.children)
          if (!res.success) {
            return res
          }
        } else {
          stack.push([child.children, expectedChild.children])
        }
      }
    }
  }

  return { success: true, message: 'Segments are as expected.' }
}

function _exactSegmentsTest(parent, _expected) {
  var stack = [[parent.children, _expected]]

  while (stack.length) {
    var current = stack.pop()
    var children = current[0]
    var expected = current[1]

    for (var i = 0; i < expected.length; ++i) {
      var expectedChild = expected[i]
      var child = children[i]
      if (!child) {
        return {
          message: util.format(
            'Expected segment "%s" as child %d of "%s", found no child.',
            expectedChild.name,
            i,
            parent.name
          )
        }
      }
      if (child.name !== expectedChild.name) {
        return {
          message: util.format(
            'Expected segment "%s" as child %d of "%s", found "%s" instead.',
            expectedChild.name,
            i,
            parent.name,
            child.name
          )
        }
      }

      if (expectedChild.children) {
        if (expectedChild.exact === false) {
          var res = _segmentsTest(child, expectedChild.children)
          if (!res.success) {
            return res
          }
        } else {
          stack.push([child.children, expectedChild.children])
        }
      }
    }

    if (children.length !== expected.length) {
      return {
        message: util.format(
          'Expected %d children for segment "%s", found %d instead.',
          expected.length,
          parent.name,
          children.length
        )
      }
    }
  }

  return { success: true, message: 'Segments are exactly as expected.' }
}

function _asserter1(test) {
  return function asertionTest(x, message) {
    var res = test(x)
    if (!res.success) {
      throw new Error(message || res.message)
    }
  }
}

function _asserter2(test) {
  return function asertionTest(x, y, message) {
    var res = test(x, y)
    if (!res.success) {
      throw new Error(message || res.message)
    }
  }
}

function _tapper1(test) {
  return function tapTest(x, message, extra) {
    var res = test(x)
    if (!res.success) {
      return this.fail(message || res.message, extra)
    }
    return this.pass(message || res.message, extra)
  }
}

function _tapper2(test) {
  return function tapTest(x, y, message, extra) {
    var res = test(x, y)
    if (!res.success) {
      return this.fail(message || res.message, extra)
    }
    return this.pass(message || res.message, extra)
  }
}
