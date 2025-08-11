# iiiaha_menu.rb
# Fallback version of iiiaha menu if not already loaded

require 'sketchup.rb'

module Iiiaha
  module Menu
    class << self
      def root
        @root ||= (UI.menu('Extensions') rescue UI.menu('Plugins'))
      end

      # 상위 "iiiaha" 메뉴를 단 한번만 생성/재사용
      def iiiaha
        @iiiaha ||= root.add_submenu('iiiaha')
      end

      # 필요시 하위 서브메뉴도 캐싱(예: "Scene", "Tools" 등)
      def submenu(title)
        @submenus ||= {}
        @submenus[title] ||= iiiaha.add_submenu(title)
      end
    end
  end
end