@work-items
Feature: The work items of a project
  A member reads the project's work items, makes one through the form, and moves, comments on and assigns one; each
  shows who last edited it. The work items a scenario makes go after it; the sample ones are read, never changed.

  Scenario: The list shows the project's work items
    Given I am a logged in user with the "member" user
    When I open the project "WEB"
    Then the work item list should show "The greeting script says Helo instead of Hello"
    And the work item list should show "An issue opened by someone outside the project"
    And the work item list should not show "Webship test nothing"

  Scenario: A member makes a work item through the form
    Given there is no work item "Webship test new" in the project "WEB"
    And I am a logged in user with the "member" user
    When I create a work item "Webship test new" in the project "WEB"
    Then the work item list should show "Webship test new"

  Scenario: A member moves a work item, comments on it and assigns it
    Given there is a work item "Webship test work" in the project "WEB"
    And I am a logged in user with the "member" user
    When I open the work item "Webship test work"
    And I set the state of the work item to "In Progress"
    And I add the comment "Checked on the test site" to the work item
    And I assign the work item to "owner"
    Then the state of the work item should be "In Progress"
    And the work item should show the comment "Checked on the test site" by "member"
    And the work item should be assigned to "owner"
    And the work item should be last edited by "owner"

  Scenario: A sample work item, as it was made
    Given I am a logged in user with the "member" user
    When I open the work item "WEB-1"
    Then the state of the work item should be "In Progress"
    And the work item should be assigned to "member"
    And the work item should show the comment "The script is in the project's repository" by "owner"
    And the work item should be last edited by "owner"
